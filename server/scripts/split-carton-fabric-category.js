/**
 * Резка картона и резка ткани — отдельные услуги (26.10.2026): каждая в своей категории.
 *   node scripts/split-carton-fabric-category.js [--apply | --undo]
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const OLD = 'Услуга резки картона и ткани';
const MAP = { 'Лазерная резка картона': 'Услуга резки картона', 'Лазерная резка ткани': 'Услуга резки ткани' };
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  for (const [name, cat] of Object.entries(MAP)) {
    const from = process.argv.includes('--undo') ? cat : OLD;
    const to = process.argv.includes('--undo') ? OLD : cat;
    const d = await P.findOne({ brand: 'matkasym-kyzmat', name, category: from });
    console.log(d ? `${name}: ${from} → ${to}` : `${name}: не в «${from}»`);
    if (d && (process.argv.includes('--apply') || process.argv.includes('--undo'))) await P.updateOne({ _id: d._id }, { $set: { category: to, updatedAt: new Date() } });
  }
  await mongoose.disconnect();
})();
