/**
 * Резка труб — из ÖNDÜRÜÜ (onuguu-set) в DAYAR TÜTÜK (dayar-tutuk), одной категорией.
 * Было две: «Услуга труборезки» (лазерная резка труб) и «услуга-труборезки» (старое имя).
 *   node scripts/move-tube-cutting-to-dayar.js [--apply]
 * Синхронизация базы труб эти карточки за трубы не примет: keyOfName у них null.
 */
const fs = require('fs'), path = require('path'), mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const APPLY = process.argv.includes('--apply');
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  const ps = await P.find({ set: 'onuguu-set', category: { $in: ['Услуга труборезки', 'услуга-труборезки'] } }).toArray();
  ps.forEach(p => console.log(`${p.category} → Услуга труборезки (dayar-tutuk) | ${p.name} | ${p.price} сом`));
  if (!APPLY) { console.log(`Предпросмотр: ${ps.length}. Для записи: --apply`); return process.exit(0); }
  fs.writeFileSync(path.join(__dirname, 'move-tube-cutting-to-dayar.backup.json'), JSON.stringify(ps, null, 1));
  const r = await P.updateMany({ _id: { $in: ps.map(p => p._id) } },
    { $set: { set: 'dayar-tutuk', category: 'Услуга труборезки', setLevel: '', updatedAt: new Date() } });
  console.log('Перенесено:', r.modifiedCount);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
