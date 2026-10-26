/**
 * SANJYRA 1–5 (POLU FABRIKAT): рамка у всех одинаковая, разный только лист с узором
 * (руководитель, 26.10.2026). Габариты по чертежу: рамка 500×190 мм, толщина 20 мм,
 * стойка выступает на 130 мм с обеих сторон.
 *   node scripts/set-sanjyra-dims.js [--apply | --undo]
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const BACKUP = path.join(__dirname, 'set-sanjyra-dims.backup.json');
const DIMS = '500×190×20 мм';
const SPECS = [
  { key: 'Размер рамки', value: '500×190 мм' },
  { key: 'Толщина рамки', value: '20 мм' },
  { key: 'Выступ стойки', value: '130 мм с каждой стороны' },
];
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (process.argv.includes('--undo')) {
    for (const b of JSON.parse(fs.readFileSync(BACKUP, 'utf8'))) {
      await P.updateOne({ _id: new mongoose.Types.ObjectId(b._id) }, { $set: { dimensions: b.dimensions, specs: b.specs } });
    }
    console.log('Вернул'); return mongoose.disconnect();
  }
  const docs = await P.find({ brand: 'matkasym-kyzmat', name: /^SANJYRA \d/ }).sort({ name: 1 }).toArray();
  docs.forEach(d => console.log(`${d.name}: «${d.dimensions || ''}» → ${DIMS}`));
  if (process.argv.includes('--apply')) {
    // бэкап: для SANJYRA 5 берём состояние до первой правки, если оно сохранено
    const prev5 = fs.existsSync(path.join(__dirname, 'set-sanjyra5-dims.backup.json'))
      ? JSON.parse(fs.readFileSync(path.join(__dirname, 'set-sanjyra5-dims.backup.json'), 'utf8')) : null;
    fs.writeFileSync(BACKUP, JSON.stringify(docs.map(d => (d.name === 'SANJYRA 5' && prev5
      ? { _id: String(d._id), ...prev5 } : { _id: String(d._id), dimensions: d.dimensions || '', specs: d.specs || [] })), null, 1));
    for (const d of docs) {
      const keep = (d.specs || []).filter(s => !SPECS.some(n => n.key === s.key));
      await P.updateOne({ _id: d._id }, { $set: { dimensions: DIMS, specs: [...SPECS, ...keep], updatedAt: new Date() } });
    }
    console.log('Записано:', docs.length);
  }
  await mongoose.disconnect();
})();
