// Электрощиты настенные IP31 (KOOZ KOOPSUZDUK) — в PDF одной полосой-линейкой
// размеров (12.10.2026). Без --apply только показывает. --undo откатывает.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { ObjectId } = mongoose.Types;
const BACKUP = path.join(__dirname, 'pdf-range-ip31.backup.json');
const TITLE = 'Электрощиты настенные IP31';

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new ObjectId(d._id) }, { $set: { pdfRange: d.pdfRange || '', pdfNote: d.pdfNote || '' } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const docs = await col.find({ set: 'kooz-koopsuzduk', category: 'Электрощиты настенные', name: /IP31/, sku: { $ne: 'MKS-KS-IP31-3' } },
    { projection: { sku: 1, name: 1, stock: 1, price: 1, pdfRange: 1, pdfNote: 1 } }).sort({ price: 1 }).toArray();
  docs.forEach(d => console.log(`${(d.sku || '—').padEnd(16)} ${d.name.padEnd(50)} ${d.price} сом, остаток ${d.stock}${/фальш/i.test(d.name) ? '  [с фальшпанелью]' : ''}`));
  if (!process.argv.includes('--apply')) { console.log(`\nПредпросмотр: ${docs.length}. Запустите с --apply.`); return process.exit(0); }
  fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 1));
  for (const d of docs) await col.updateOne({ _id: d._id }, { $set: { pdfRange: TITLE, pdfNote: /фальш/i.test(d.name) ? 'с фальшпанелью' : (d.pdfNote || '') } });
  console.log(`\nОбновлено: ${docs.length}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
