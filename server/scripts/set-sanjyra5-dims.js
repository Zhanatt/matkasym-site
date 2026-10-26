/**
 * SANJYRA 5 (POLU FABRIKAT): габариты по чертежу (прислал руководитель 26.10.2026):
 * рамка 500×190 мм, толщина 20 мм, стойка выступает на 130 мм с каждой стороны.
 *   node scripts/set-sanjyra5-dims.js [--apply | --undo]
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const BACKUP = path.join(__dirname, 'set-sanjyra5-dims.backup.json');
const SPECS = [
  { key: 'Размер рамки', value: '500×190 мм' },
  { key: 'Толщина рамки', value: '20 мм' },
  { key: 'Выступ стойки', value: '130 мм с каждой стороны' },
];
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  const d = await P.findOne({ brand: 'matkasym-kyzmat', name: 'SANJYRA 5' });
  if (process.argv.includes('--undo')) {
    const b = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    await P.updateOne({ _id: d._id }, { $set: { dimensions: b.dimensions, specs: b.specs } });
    console.log('Вернул'); return mongoose.disconnect();
  }
  console.log(`SANJYRA 5: габариты «${d.dimensions || ''}» → 500×190×20 мм`);
  if (process.argv.includes('--apply')) {
    fs.writeFileSync(BACKUP, JSON.stringify({ dimensions: d.dimensions || '', specs: d.specs || [] }, null, 1));
    const keep = (d.specs || []).filter(s => !SPECS.some(n => n.key === s.key));
    await P.updateOne({ _id: d._id }, { $set: { dimensions: '500×190×20 мм', specs: [...SPECS, ...keep], updatedAt: new Date() } });
    console.log('Записано');
  }
  await mongoose.disconnect();
})();
