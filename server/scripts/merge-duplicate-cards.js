/**
 * Слияние карточек-двойников.
 *
 * Одно изделие заведено в 1С трижды — в Make-in, Matkasym и Q-top, каждый раз под
 * своим именем номенклатуры. Загрузка остатков связывалась с сайтом по имени, поэтому
 * на каждое имя завелась своя карточка: в каталоге они выглядят как разные товары,
 * а у пары «COMFORT (Черная)» / «COMFORT(Черная)» имена ещё и сходятся при нестрогом
 * сравнении — обе тянули один и тот же остаток Make-in, и 305 штук показывались дважды.
 *
 * Скрипт оставляет одну карточку на изделие:
 *   · остаток по каждой базе — максимум из карточек (это один и тот же склад, не сумма);
 *   · пустые поля выжившей карточки добираются из дубля (фото, цена, характеристики);
 *   · ссылки других коллекций (заказы, журналы, публикации) переводятся на выжившую;
 *   · дубль удаляется, обе карточки целиком уходят в бэкап.
 *
 *   node scripts/merge-duplicate-cards.js           # показать, что произойдёт
 *   node scripts/merge-duplicate-cards.js --apply   # выполнить
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');
const { BASE_KEYS, STOCK_SUM_BASES } = require('../lib/stockBases');

const APPLY = process.argv.includes('--apply');
const SET = 'taza-kiym';

/**
 * keep — артикул карточки, которая остаётся; drop — артикул дубля.
 * sku — какой артикул получит выжившая (по чертежу), если он ещё не тот.
 */
const PAIRS = [
  { keep: 'MKS-ДУ0014-BLK', drop: 'MKS-TK-028', note: 'COMFORT чёрная: дубль тянул те же 305 шт Make-in' },
  { keep: 'MKS-ДУ0015-PNK', drop: 'MKS-TK-029', note: 'SAKURA розовая: Make-in 121 + Q-top 64' },
  // AVANGARD: история продаж и публикации живут на ДУ-карточке, фото и видео — на второй.
  // Оставляем ту, где история (её не перенести без потерь), фото забираем принудительно.
  { keep: 'MKS-ДУ0016-BLK', drop: 'MKS-SD-102', take: ['images', 'driveImages', 'hasVideo'],
    note: 'AVANGARD: 40 записей продаж на ДУ-карточке, 8 фото — на второй' },
  { keep: 'MKS-ДУ0127-BLK', drop: 'MKS-TK-025', note: 'Keremet+ чёрная' },
  { keep: 'MKS-ДУ0122-WHT', drop: 'MKS-TK-009', note: 'KERBEN белый: дубль пустой' },
  { keep: 'MKS-ДУ0122-BLK', drop: 'MKS-TK-011', note: 'KERBEN чёрный: дубль пустой' },
  { keep: 'MKS-ДУ0114-BLK', drop: 'MKS-XX-010', note: 'MURAS 1 чёрная: Make-in 1 + Q-top 120' },

  // SANIRA — закупная линейка, чертежа ДУ у неё нет: артикул задаём по модели и размеру.
  // В Make-in доска заведена подробно («пластиковой выдвижной SANIRA(S)»), в Q-top коротко
  // («SANIRA (S)») — по именам они не сходились, и остаток Казахстана висел отдельной карточкой.
  { keep: 'MKS-SD-S1-BLU', drop: 'MKS-XX-005', sku: 'MKS-SANIRA-S',
    note: 'SANIRA(S): Make-in 258 + Q-top 88' },
  { keep: 'MKS-SD-S1-ORG', dropName: 'Гладильная доска SANIRA (M)', sku: 'MKS-SANIRA-M',
    note: 'SANIRA(M): Make-in 106 + Q-top 80, у дубля артикула нет' },
];

// Остальные размеры линейки SANIRA: двойников у них нет, но артикул должен быть в том же виде
const RENAME = [
  { sku: 'MKS-SD-S1-TIK', to: 'MKS-SANIRA-X', expect: 'железная SANIRA(X)' },
  { sku: 'MKS-SD-S1-RED', to: 'MKS-SANIRA-A', expect: 'с двойной ножкой SANIRA(A)' },
  { sku: 'MKS-SD-S1-GRN', to: 'MKS-SANIRA-E', expect: 'с большой подставкой SANIRA(E)' },
];

// Куда смотрят чужие коллекции. Массивы (favorites, products) правятся тем же $set
// по позиционному оператору, поэтому отмечены отдельно.
const REFS = [
  { model: 'Order',          field: 'items.$[el].product', match: 'items.product', arrayFilter: true },
  { model: 'Feedback',       field: 'product' },
  { model: 'ShopRequest',    field: 'product' },
  { model: 'ProductRequest', field: 'product' },
  // Уникальный индекс audit+product+frontman: если обе карточки проверяли в одном
  // аудите, после слияния это два отзыва об одном товаре от одного фронтмена.
  // Отзыв с дубля в таком случае удаляем — он ушёл бы в бэкап вместе с карточкой.
  { model: 'ProductReview',  field: 'product', onConflict: 'drop' },
  { model: 'ProductLaunch',  field: 'product' },
  { model: 'Publication',    field: 'product' },
  { model: 'ReceiveAlert',   field: 'product' },
  { model: 'VideoSchedule',  field: 'product' },
  { model: 'PhotoLog',       field: 'productId' },
  { model: 'StockLog',       field: 'productId' },
  { model: 'ChangeLog',      field: 'productId' },
  { model: 'ProductLog',     field: 'productId' },
  { model: 'PriceLog',       field: 'productId' },
  { model: 'SalesRecord',    field: 'productId' },
  { model: 'News',           field: 'product.id' },
  { model: 'User',           field: 'favorites',  positional: true },
  { model: 'Supplier',       field: 'products',   positional: true },
  { model: 'Product',        field: 'kitParts.$[el].product', match: 'kitParts.product', arrayFilter: true },
];

const modelOf = name => { try { return require(`../models/${name}`); } catch (_) { return null; } };

// Пустое поле выжившей карточки добираем из дубля: карточки заводились в разное время,
// у одной есть фото, у другой цена из Q-top.
const isEmpty = v => v === undefined || v === null || v === '' || v === 0 ||
  (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
const FILLABLE = ['images', 'driveImages', 'price', 'priceWholesale', 'priceDealer', 'priceCost',
  'description', 'dimensions', 'color', 'category', 'specs', 'bufferStock', 'barcode'];

async function countRefs(id) {
  const out = [];
  for (const r of REFS) {
    const M = modelOf(r.model);
    if (!M) continue;
    const field = r.match || r.field;
    const n = await M.countDocuments({ [field]: id });
    if (n) out.push({ ...r, n });
  }
  return out;
}

async function repoint(fromId, toId, conflicts) {
  const done = [];
  for (const r of REFS) {
    const M = modelOf(r.model);
    if (!M) continue;
    const field = r.match || r.field;
    const upd = r.arrayFilter
      ? [{ $set: { [r.field]: toId } }, { arrayFilters: [{ 'el.product': fromId }] }]
      : r.positional
        ? [{ $set: { [`${r.field}.$`]: toId } }, {}]
        : [{ $set: { [r.field]: toId } }, {}];
    try {
      const res = await M.updateMany({ [field]: fromId }, upd[0], upd[1]);
      if (res.modifiedCount) done.push(`${r.model}.${r.field} ×${res.modifiedCount}`);
      continue;
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
    // Уникальный индекс не пустил всю пачку разом — переносим по одной записи,
    // чтобы из-за одного конфликта не потерять остальные.
    let moved = 0, hit = 0;
    for (const doc of await M.find({ [field]: fromId }).lean()) {
      try {
        await M.updateOne({ _id: doc._id }, upd[0], upd[1]);
        moved++;
      } catch (e) {
        if (e.code !== 11000) throw e;
        hit++;
        conflicts.push({ model: r.model, doc });
        if (r.onConflict === 'drop') await M.deleteOne({ _id: doc._id });
      }
    }
    if (moved) done.push(`${r.model}.${r.field} ×${moved}`);
    if (hit)   done.push(`${r.model}: конфликт у ${hit} ${r.onConflict === 'drop' ? '(удалены, есть в бэкапе)' : '(оставлены на старой карточке!)'}`);
  }
  return done;
}

(async () => {
  await mongoose.connect(MONGO_URI);

  const plan = [];
  for (const pair of PAIRS) {
    const keep = await Product.findOne({ sku: pair.sku || pair.keep, set: SET }).lean()
              || await Product.findOne({ sku: pair.keep, set: SET }).lean();
    // Дубль ищем по артикулу, а у карточек из Q-top его местами просто нет — тогда по имени
    const drop = pair.dropName
      ? await Product.findOne({ fullName: pair.dropName, set: SET }).lean()
      : await Product.findOne({ sku: pair.drop, set: SET }).lean();
    if (!drop && keep) { console.log(`•  уже слито: ${pair.keep}`); continue; }
    if (!keep || !drop) {
      console.log(`⚠  пропуск ${pair.keep} ← ${pair.drop || pair.dropName}: ${!keep ? 'нет карточки-получателя' : 'нет дубля'}`);
      continue;
    }
    if (String(keep._id) === String(drop._id)) { console.log(`⚠  ${pair.keep}: получатель и дубль — одна карточка`); continue; }

    const byBase = {};
    BASE_KEYS.forEach(b => {
      byBase[b] = Math.max(keep.stockByBase?.[b] || 0, drop.stockByBase?.[b] || 0);
    });
    const stock = STOCK_SUM_BASES.reduce((n, b) => n + byBase[b], 0);

    const fill = {};
    FILLABLE.forEach(f => { if (isEmpty(keep[f]) && !isEmpty(drop[f])) fill[f] = drop[f]; });
    // take — забрать поле с дубля, даже если у выжившей оно заполнено (фото получше)
    (pair.take || []).forEach(f => { if (!isEmpty(drop[f])) fill[f] = drop[f]; });

    plan.push({ pair, keep, drop, byBase, stock, fill, refs: await countRefs(drop._id) });
  }

  console.log(`\nК слиянию: ${plan.length} пар\n`);
  for (const p of plan) {
    console.log(`■ ${p.keep.fullName}`);
    console.log(`   остаётся: ${p.keep.sku.padEnd(16)} mk:${p.keep.stockByBase?.makein || 0} mt:${p.keep.stockByBase?.matkasym || 0} qt:${p.keep.stockByBase?.qtop || 0}  фото:${(p.keep.images || []).length}  цена:${p.keep.price || 0}`);
    console.log(`   удалить:  ${p.drop.sku.padEnd(16)} mk:${p.drop.stockByBase?.makein || 0} mt:${p.drop.stockByBase?.matkasym || 0} qt:${p.drop.stockByBase?.qtop || 0}  фото:${(p.drop.images || []).length}  цена:${p.drop.price || 0}   «${p.drop.fullName}»`);
    console.log(`   станет:   mk:${p.byBase.makein} mt:${p.byBase.matkasym} qt:${p.byBase.qtop} → в наличии по КР ${p.stock} шт`
      + (p.pair.sku && p.pair.sku !== p.keep.sku ? `, артикул → ${p.pair.sku}` : ''));
    if (Object.keys(p.fill).length) console.log(`   доберём из дубля: ${Object.keys(p.fill).join(', ')}`);
    console.log(`   ссылки на дубль: ${p.refs.length ? p.refs.map(r => `${r.model}×${r.n}`).join(', ') : 'нет'}`);
    console.log(`   ${p.pair.note}`);
    console.log('');
  }

  const renames = [];
  for (const r of RENAME) {
    const p = await Product.findOne({ sku: r.sku, set: SET }).select('fullName sku').lean();
    if (!p) { console.log(`•  ${r.sku} → ${r.to}: карточки нет (возможно, уже переименована)`); continue; }
    if (!String(p.fullName).includes(r.expect)) { console.log(`⚠  ${r.sku}: ждали «${r.expect}», в базе «${p.fullName}»`); continue; }
    renames.push({ id: p._id, from: p.sku, to: r.to, name: p.fullName });
  }
  if (renames.length) {
    console.log(`Переименование артикулов (${renames.length}):`);
    renames.forEach(r => console.log(`   ${r.from.padEnd(16)} → ${r.to.padEnd(16)} ${r.name}`));
    console.log('');
  }

  if (!APPLY) {
    console.log('Предпросмотр. Для выполнения — с флагом --apply');
    await mongoose.disconnect();
    return;
  }

  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `merge-cards-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify({
    pairs: plan.map(p => ({ keep: p.keep, drop: p.drop })), renames,
  }, null, 2));
  console.log(`Бэкап обеих карточек: ${backup}\n`);

  const conflicts = [];
  for (const p of plan) {
    const moved = await repoint(p.drop._id, p.keep._id, conflicts);
    const $set = {
      ...p.fill,
      stock: p.stock,
      inStock: p.stock > 0,
      stockStatus: p.stock > 0 ? 'in_stock' : 'out_of_stock',
      ...Object.fromEntries(BASE_KEYS.map(b => [`stockByBase.${b}`, p.byBase[b]])),
    };
    if (p.pair.sku) $set.sku = p.pair.sku;
    await Product.updateOne({ _id: p.keep._id }, { $set });
    await Product.deleteOne({ _id: p.drop._id });
    console.log(`✓ ${p.keep.fullName}: удалён дубль ${p.drop.sku}${moved.length ? ', перенесено ' + moved.join(', ') : ''}`);
  }

  for (const r of renames) {
    await Product.updateOne({ _id: r.id }, { $set: { sku: r.to } });
    console.log(`✓ ${r.name}: ${r.from} → ${r.to}`);
  }

  if (conflicts.length) {
    const cf = path.join(dir, `merge-conflicts-${Date.now()}.json`);
    fs.writeFileSync(cf, JSON.stringify(conflicts, null, 2));
    console.log(`\nЗаписи, не прошедшие по уникальному индексу: ${conflicts.length} → ${cf}`);
  }

  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
