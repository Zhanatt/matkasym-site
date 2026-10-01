/**
 * Пересчёт цен витрины (price/priceWholesale/priceDealer/priceCost) по правилу
 * «SHAAR — прайсы Matkasym, HOME — прайсы Make-in» из уже загруженных pricesByBase.
 *
 * До 01.10.2026 загрузка прайса писала на витрину цену Make-in всем товарам, которые
 * есть в Make-in, — у SHAAR-товаров из обеих баз на сайте стояла цена не той базы.
 * Нулевую цену базы не переносим: ноль значит «в прайсе не было», а не «бесплатно».
 *
 *   node scripts/resync-showcase-prices.js           — показать, что изменится
 *   node scripts/resync-showcase-prices.js --apply   — записать (с бэкапом)
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { PRICE_TYPES, writesShowcasePrice, showcasePriceBase, STOCK_SUM_BASES } = require('../lib/stockBases');

const APPLY = process.argv.includes('--apply');
const TYPES = ['retail', 'wholesale', 'dealer', 'cost'];

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('products');
  const products = await col.find({}, { projection: {
    name: 1, fullName: 1, sku: 1, brand: 1, inBase: 1, pricesByBase: 1,
    price: 1, priceWholesale: 1, priceDealer: 1, priceCost: 1,
  } }).toArray();

  const changes = [];
  for (const p of products) {
    // База-источник: своя по бренду, а если товара в ней нет — та киргизская, где он есть
    const own = showcasePriceBase(p);
    const base = [own, ...STOCK_SUM_BASES.filter(b => b !== own)]
      .find(b => p.inBase?.[b] && writesShowcasePrice(p, b));
    if (!base) continue;
    // Только те, у кого база-источник поменялась (по старому правилу — Make-in, если товар
    // в нём есть). Где база та же, расхождение — ручная правка цены, её не трогаем.
    const oldBase = p.inBase?.makein ? 'makein' : base;
    if (oldBase === base) continue;
    const set = {};
    for (const t of TYPES) {
      const field = PRICE_TYPES[t].legacyField;
      const v = Number(p.pricesByBase?.[base]?.[t]) || 0;
      if (v > 0 && v !== Number(p[field] || 0)) set[field] = v;
    }
    if (Object.keys(set).length) changes.push({ p, base, set });
  }

  const byBrand = {};
  changes.forEach(c => { byBrand[c.p.brand || '—'] = (byBrand[c.p.brand || '—'] || 0) + 1; });
  console.log(`товаров с другой ценой на витрине: ${changes.length}`, byBrand);
  for (const { p, base, set } of changes) {
    const diff = Object.entries(set).map(([f, v]) => `${f} ${p[f] || 0}→${v}`).join(', ');
    console.log(`  ${(p.brand || '').padEnd(15)} ${base.padEnd(9)} ${(p.fullName || p.name).slice(0, 52).padEnd(52)} ${diff}`);
  }

  if (!APPLY) { console.log('\nПредпросмотр. Запусти с --apply.'); await mongoose.disconnect(); return; }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const backup = path.join(__dirname, `backup-showcase-prices-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(changes.map(({ p }) => ({
    _id: String(p._id), name: p.fullName || p.name,
    price: p.price, priceWholesale: p.priceWholesale, priceDealer: p.priceDealer, priceCost: p.priceCost,
  })), null, 1));
  console.log(`\nпрежние цены сохранены: ${path.basename(backup)}`);

  for (const { p, set } of changes) {
    await col.updateOne({ _id: p._id }, { $set: { ...set, updatedAt: new Date() } });
  }
  console.log(`✔ обновлено: ${changes.length}`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
