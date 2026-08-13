/**
 * Разовый бэкфилл: цены базы Matkasym → старые поля товара.
 *
 * До 13.08.2026 upload-prices дублировал цену в price/priceWholesale/priceDealer
 * только для прайса Make-in. У товаров, которых в Make-in нет (шкафы Uzak Koldon
 * и прочий Matkasym Shaar), цена оставалась только в pricesByBase — витрина её
 * не видела: «Цена не определена». Роут исправлен, этот скрипт добирает то,
 * что уже загружено, чтобы не перезаливать прайсы руками.
 *
 * Заодно снимает priceUndefined там, где продажная цена появилась: флаг ставили
 * при импорте привозных товаров («цену узнаем у поставщика»), сейчас он устарел.
 *
 * Q-top не трогаем: его прайс в тенге, а старое поле витрина читает как сомы.
 *
 *   node scripts/backfill-legacy-prices.js            # предпросмотр
 *   node scripts/backfill-legacy-prices.js --apply    # записать (с бэкапом)
 */
const fs       = require('fs');
const path     = require('path');
const mongoose = require('mongoose');
const Product  = require('../models/Product');
const MONGO_URI = require('../lib/atlas');

const APPLY = process.argv.includes('--apply');

// Тип цены → старое поле товара. export пропущен: у него старого поля нет.
const LEGACY = { retail: 'price', wholesale: 'priceWholesale', dealer: 'priceDealer', cost: 'priceCost' };
const SALE   = ['retail', 'wholesale', 'dealer'];

async function main() {
  await mongoose.connect(MONGO_URI);

  // Товар, у которого есть хоть одна цена Matkasym и которого нет в Make-in
  const products = await Product.find({
    $or: Object.keys(LEGACY).map(t => ({ [`pricesByBase.matkasym.${t}`]: { $gt: 0 } })),
    'inBase.makein': { $ne: true },
  }).select('name fullName sku brand set inBase priceUndefined pricesByBase price priceWholesale priceDealer priceCost').lean();

  const changes = [];
  for (const p of products) {
    const set = {};
    for (const [type, field] of Object.entries(LEGACY)) {
      const fresh = Number(p.pricesByBase?.matkasym?.[type]) || 0;
      const old   = Number(p[field]) || 0;
      if (fresh > 0 && fresh !== old) set[field] = fresh;
    }
    const gotSalePrice = SALE.some(t => Number(p.pricesByBase?.matkasym?.[t]) > 0);
    if (p.priceUndefined && gotSalePrice) set.priceUndefined = false;
    if (Object.keys(set).length) changes.push({ p, set });
  }

  console.log(`Товаров с ценой Matkasym и без Make-in: ${products.length}`);
  console.log(`К обновлению: ${changes.length}\n`);
  for (const { p, set } of changes) {
    const what = Object.entries(set)
      .map(([f, v]) => f === 'priceUndefined' ? 'снять «цена не определена»' : `${f}: ${Number(p[f]) || 0} → ${v}`)
      .join(', ');
    console.log(`  ${(p.sku || '—').padEnd(12)} ${(p.fullName || p.name || '').slice(0, 45).padEnd(46)} ${what}`);
  }

  if (!APPLY) {
    console.log('\nПредпросмотр. Записать: node scripts/backfill-legacy-prices.js --apply');
    return mongoose.disconnect();
  }
  if (!changes.length) return mongoose.disconnect();

  const stamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backup = path.join(__dirname, `backup-legacy-prices-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(changes.map(c => c.p), null, 1));
  console.log(`\nБэкап: ${backup}`);

  await Product.bulkWrite(changes.map(({ p, set }) => ({
    updateOne: { filter: { _id: p._id }, update: { $set: set } },
  })), { ordered: false });
  console.log(`Обновлено: ${changes.length}`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
