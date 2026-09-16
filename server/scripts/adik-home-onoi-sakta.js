/**
 * Стеллажи ADIK HOME — в двух сетах сразу.
 *
 * Линейка живёт в Baary Oorunda (бренд Matkasym Home), но тем же товаром
 * торгует и Onoy Sakta (Matkasym Shaar). Карточку не дублируем: копия развела
 * бы фото, характеристики и остатки по двум документам, а правили бы их потом
 * порознь. Вместо копии — запись в Product.alsoIn: «показывать ещё и здесь».
 *
 * Продавцы у сетов разные, поэтому у каждого места своя база 1С:
 *   Baary Oorunda → Make-in   (Product.stockBase)
 *   Onoy Sakta    → Matkasym  (Product.alsoIn[].base)
 * Витрина сета берёт остаток и прайс этой базы (server/lib/setView.js), а не
 * сумму по Кыргызстану — иначе один и тот же стеллаж стоял бы в двух сетах
 * с одинаковыми цифрами, которых нет ни у одного из двух складов.
 *
 *   node scripts/adik-home-onoi-sakta.js            # показать, что изменится
 *   node scripts/adik-home-onoi-sakta.js --apply    # записать
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const APPLY = process.argv.includes('--apply');

const HOME_SET  = 'baary-oorunda';
const SHAAR_SET = 'onoi-sakta';
const SHAAR_BRAND = 'matkasym-shaar';
const HOME_BASE  = 'makein';
const SHAAR_BASE = 'matkasym';

const money = n => (Number(n) > 0 ? `${Number(n).toLocaleString('ru')} сом` : '—');

(async () => {
  await mongoose.connect(MONGO_URI);

  // Именно ADIK HOME: в сете лежат и другие стеллажи, их никуда не переносим.
  const products = await Product.find({
    set: HOME_SET,
    $or: [{ name: /ADIK\s+HOME/i }, { fullName: /ADIK\s+HOME/i }],
  }).lean();

  const plan = products.map(p => ({
    id: p._id,
    before: { stockBase: p.stockBase || '', alsoIn: p.alsoIn || [] },
    after: {
      stockBase: HOME_BASE,
      // Чужие места из других сетов не трогаем — заменяем только своё.
      alsoIn: [
        ...(p.alsoIn || []).filter(a => a.set !== SHAAR_SET).map(a => ({ brand: a.brand, set: a.set, base: a.base })),
        { brand: SHAAR_BRAND, set: SHAAR_SET, base: SHAAR_BASE },
      ],
    },
    row: {
      sku: p.sku || '(без артикула)',
      name: p.fullName || p.name,
      makein:   { stock: p.stockByBase?.makein   || 0, retail: p.pricesByBase?.makein?.retail   || 0 },
      matkasym: { stock: p.stockByBase?.matkasym || 0, retail: p.pricesByBase?.matkasym?.retail || 0 },
      price: p.price || 0,
    },
  }));

  console.log(`ADIK HOME в сете ${HOME_SET}: ${plan.length} карточек\n`);
  console.log('артикул'.padEnd(20) + 'Baary Oorunda (Make-in)'.padEnd(28) + 'Onoy Sakta (Matkasym)');
  for (const { row } of plan) {
    const left  = `${row.makein.stock} шт · ${money(row.makein.retail || row.price)}`;
    const right = `${row.matkasym.stock} шт · ${money(row.matkasym.retail || row.price)}`;
    console.log(row.sku.padEnd(20) + left.padEnd(28) + right + `   ${row.name}`);
  }

  // Прайс базы не загружен — на витрине останется общая цена товара. Не ошибка,
  // но лучше знать заранее, чем искать потом, откуда взялась цифра.
  const noPrice = plan.filter(x => !x.row.matkasym.retail || !x.row.makein.retail);
  if (noPrice.length) {
    console.log(`\nУ ${noPrice.length} позиций одна из баз без розничной цены — там покажется общая цена карточки:`);
    noPrice.forEach(x => console.log(`   ${x.row.sku}: Make-in ${money(x.row.makein.retail)}, Matkasym ${money(x.row.matkasym.retail)}`));
  }
  const noSku = plan.filter(x => x.row.sku === '(без артикула)');
  if (noSku.length) {
    console.log(`\nБез артикула: ${noSku.length} — проверь, не дубли ли это, они поедут в Onoy Sakta как есть:`);
    noSku.forEach(x => console.log(`   ${x.row.name}`));
  }

  if (!plan.length) { console.log('Нечего менять.'); await mongoose.disconnect(); return; }
  if (!APPLY) { console.log('\nЭто предпросмотр. Записать: --apply'); await mongoose.disconnect(); return; }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = path.join(__dirname, `backup-adik-onoi-sakta-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(plan.map(x => ({ _id: x.id, ...x.before })), null, 2));
  console.log(`\nБэкап: ${path.relative(process.cwd(), file)}`);

  for (const x of plan) await Product.updateOne({ _id: x.id }, { $set: x.after });
  console.log(`Обновлено: ${plan.length}`);
  await mongoose.disconnect();
})();
