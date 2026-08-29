/**
 * Переносит порядок товаров в сетах из объекта «категория → список» в массив пар.
 *
 * Зачем: поле было mongoose-Map, а Map запрещает точку в ключе. Категории
 * «Распред. щиты встраиваемые» и «Распред. щиты накладные» точку содержат, и
 * сохранение порядка в сете kooz-koopsuzduk падало целиком с ошибкой
 * «Mongoose maps do not support keys that contain "."».
 *
 *   node scripts/migrate-setlayout-products.js           # предпросмотр
 *   node scripts/migrate-setlayout-products.js --apply   # перенос
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('setlayouts');
  const docs = await col.find({ products: { $exists: true } }).toArray();
  console.log(`документов со старым полем products: ${docs.length}`);

  for (const d of docs) {
    const rows = Object.entries(d.products || {})
      .filter(([, names]) => Array.isArray(names) && names.length)
      .map(([category, names]) => ({ category, names }));
    console.log(`\n${d.brand} / ${d.set}: категорий с порядком — ${rows.length}`);
    rows.forEach(r => console.log(`   ${r.category} — ${r.names.length} тов.`));
    if (!APPLY) continue;
    // Старое поле убираем: с ним mongoose будет пытаться привести объект
    // к массиву и падать на чтении.
    await col.updateOne({ _id: d._id }, { $set: { productOrder: rows }, $unset: { products: '' } });
  }

  if (!APPLY) console.log('\nэто предпросмотр, ничего не записано — добавьте --apply');
  else console.log('\nперенос выполнен');
  await mongoose.disconnect();
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
