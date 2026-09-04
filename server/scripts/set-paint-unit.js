/**
 * Проставляет единицу учёта «кг» краскам и эмалям.
 *
 * В номенклатуре 1С единица стоит в конце названия («Краска RAL3000 (красная), кг»),
 * но при загрузке остатков хвост отрезается, и на сайте у всех товаров были штуки.
 * На карточке краски «650 шт.» читается как ошибка учёта.
 *
 *   node scripts/set-paint-unit.js           # предпросмотр
 *   node scripts/set-paint-unit.js --apply
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');
const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(MONGO_URI);
  // Растворитель и клей меряют литрами — их в «Покраске» нет, но фильтр по
  // названию берём точный, чтобы скрипт не задел лишнего при повторном запуске.
  const paints = await Product.find({
    category: 'Покраска',
    fullName: /^(краска|эмаль)/i,
  }).select('sku fullName unit stock').lean();

  console.log(`красок и эмалей: ${paints.length}`);
  const need = paints.filter(p => p.unit !== 'кг');
  console.log(`нужно поправить: ${need.length}`);
  need.slice(0, 8).forEach(p => console.log(`   ${(p.sku || '—').padEnd(17)} ${p.stock} → кг   ${p.fullName}`));
  if (need.length > 8) console.log(`   … и ещё ${need.length - 8}`);

  if (!APPLY) { console.log('\nпредпросмотр, ничего не записано — добавьте --apply'); }
  else {
    const r = await Product.updateMany(
      { _id: { $in: need.map(p => p._id) } },
      { $set: { unit: 'кг' } },
    );
    console.log(`\nобновлено: ${r.modifiedCount}`);
  }
  await mongoose.disconnect();
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
