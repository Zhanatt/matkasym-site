/**
 * 27.10.2026, по слову руководителя: листы и рулон — российская сталь; трубы бесшовные.
 *  · листы (Металлические листы): характеристика «Производство: Россия»;
 *  · рулон: «Производство: Россия», описание с «российское качество»;
 *  · трубы DAYAR TÜTÜK: «Шов: Нет» → «Шов: бесшовная».
 *   node scripts/russian-steel-seamless.js [--apply | --undo]
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const BACKUP = path.join(__dirname, 'russian-steel-seamless.backup.json');
const setSpec = (specs, key, value) => {
  const list = [...(specs || [])];
  const i = list.findIndex(s => String(s.key).toLowerCase() === key.toLowerCase());
  if (i >= 0) list[i] = { ...list[i], value }; else list.push({ key, value });
  return list;
};
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (process.argv.includes('--undo')) {
    for (const b of JSON.parse(fs.readFileSync(BACKUP, 'utf8'))) {
      await P.updateOne({ _id: new mongoose.Types.ObjectId(b._id) }, { $set: { specs: b.specs, description: b.description } });
    }
    console.log('Вернул'); return mongoose.disconnect();
  }
  const sheets = await P.find({ brand: 'matkasym-kyzmat', category: 'Металлические листы' }).toArray();
  const rolls = await P.find({ brand: 'matkasym-kyzmat', category: 'Металлический рулон' }).toArray();
  const tubes = await P.find({ brand: 'matkasym-kyzmat', set: 'dayar-tutuk', category: /^Трубы/ }).toArray();
  console.log(`листов ${sheets.length}, рулонов ${rolls.length}, труб ${tubes.length}`);
  if (!process.argv.includes('--apply')) return mongoose.disconnect();
  const all = [...sheets, ...rolls, ...tubes];
  fs.writeFileSync(BACKUP, JSON.stringify(all.map(d => ({ _id: String(d._id), specs: d.specs || [], description: d.description || '' })), null, 1));
  for (const d of sheets) await P.updateOne({ _id: d._id }, { $set: { specs: setSpec(d.specs, 'Производство', 'Россия'), updatedAt: new Date() } });
  for (const d of rolls) await P.updateOne({ _id: d._id }, { $set: { specs: setSpec(d.specs, 'Производство', 'Россия'), updatedAt: new Date(),
    description: 'Рулонная сталь российского качества шириной 1000 и 1250 мм. Длина рулона бывает разной — уточняйте наличие и цену у менеджера.' } });
  for (const d of tubes) await P.updateOne({ _id: d._id }, { $set: { specs: setSpec(d.specs, 'Шов', 'бесшовная'), updatedAt: new Date() } });
  console.log('Записано:', all.length, 'бэкап', path.basename(BACKUP));
  await mongoose.disconnect();
})();
