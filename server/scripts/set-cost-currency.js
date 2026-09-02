/**
 * Валюта себестоимости у привозных товаров.
 *
 * Запуск из папки server:
 *   node scripts/set-cost-currency.js                     — показать, что изменится
 *   node scripts/set-cost-currency.js --apply             — записать
 *   node scripts/set-cost-currency.js --supplier="Temu" --currency=CNY --apply
 *
 * Себестоимость — это закупочная цена, и у китайских поставщиков она в юанях:
 * шкаф Оудэбао стоит 395 ¥ при рознице 24 830 сом, и подпись «395 сом» читалась
 * как ошибка. Валюта продажи при этом не меняется — только валюта закупа.
 *
 * По умолчанию правим Оудэбао: у остальных поставщиков себестоимость похожа на
 * сомы (розница выше закупа в 1,3–2,6 раза), а у Оудэбао — в 44 раза.
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const APPLY = process.argv.includes('--apply');
const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=');

const supplier = arg('supplier') || 'Оудэбао';
const currency = arg('currency') || 'CNY';

(async () => {
  await mongoose.connect(MONGO_URI);

  const filter = {
    priceCost: { $gt: 0 },
    'supplier.company': new RegExp(supplier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    costCurrency: { $ne: currency },
  };
  const items = await Product.find(filter).select('name sku price priceCost supplier costCurrency').lean();

  console.log(`поставщик «${supplier}» → валюта себестоимости ${currency}`);
  console.log(`товаров под правку: ${items.length}`);
  items.slice(0, 12).forEach(p => console.log(
    `   ${(p.name || '').slice(0, 40).padEnd(42)} ${(p.sku || '').padEnd(16)} себес ${String(p.priceCost).padStart(7)} · розница ${p.price}`,
  ));
  if (items.length > 12) console.log(`   … и ещё ${items.length - 12}`);

  // Себестоимость выше розницы — либо не та валюта, либо опечатка в цифре
  const odd = await Product.find({ priceCost: { $gt: 0 }, price: { $gt: 0 }, $expr: { $gt: ['$priceCost', '$price'] } })
    .select('name sku price priceCost supplier').lean();
  if (odd.length) {
    console.log(`\nсебестоимость выше розницы — проверить руками (${odd.length}):`);
    odd.slice(0, 10).forEach(p => console.log(
      `   ${(p.name || '').slice(0, 40).padEnd(42)} себес ${String(p.priceCost).padStart(12)} · розница ${p.price} · ${p.supplier?.company || '—'}`,
    ));
  }

  if (!APPLY) { console.log('\nПредпросмотр. Запусти с --apply.'); await mongoose.disconnect(); return; }
  if (!items.length) { console.log('\nНечего менять.'); await mongoose.disconnect(); return; }

  const r = await Product.updateMany(filter, { $set: { costCurrency: currency } });
  console.log(`\n✔ обновлено: ${r.modifiedCount}`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
