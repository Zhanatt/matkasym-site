/**
 * Трубы не 0,9/0,95 мм, у которых есть остаток, — пока не удаляем (ждём ответа),
 * но в PDF не печатаем: hideInPdf = true.
 *   node scripts/hide-in-pdf-tubes-stock.js [--apply | --undo]
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const KEEP = [0.9, 0.95];
const wallOf = p => {
  const s = (p.specs || []).find(x => /толщина стенки/i.test(x.key || ''))?.value;
  const last = (String(p.name).replace(/\([^)]*\)/g, '').match(/\d+(?:[.,]\d+)?/g) || []).pop();
  return parseFloat(String(s || last).replace(',', '.'));
};
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  const all = await P.find({ brand: 'matkasym-kyzmat', set: 'dayar-tutuk', category: { $not: /резк/i } }).toArray();
  const hit = all.filter(p => !KEEP.includes(wallOf(p)));
  hit.forEach(p => console.log(wallOf(p), '|', p.name, '| остаток', p.stock));
  if (process.argv.includes('--apply')) await P.updateMany({ _id: { $in: hit.map(p => p._id) } }, { $set: { hideInPdf: true } });
  if (process.argv.includes('--undo')) await P.updateMany({ _id: { $in: hit.map(p => p._id) } }, { $unset: { hideInPdf: 1 } });
  console.log(hit.length);
  await mongoose.disconnect();
})();
