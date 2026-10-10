// Парты и стулья сета bilim-kelechek не печатаются в PDF-каталоге (просили 10.10.2026).
// Без --apply только показывает, что изменится. С --apply пишет бэкап и ставит hideInPdf.
// Откат: --undo вернёт значения из бэкапа.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

// В артикулах «MKS-BK-Х450…» буква Х — кириллическая
const SKUS = [
  'MKS-BK-Х450-5', 'MKS-BK-Х450-4', 'MKS-BK-Х450', 'MKS-BK-Х450-3', 'MKS-BK-Х450-11',
  'MKS-BK-001', 'MKS-BK-007', 'MKS-SC-001', 'MKS-BK-008', 'MKS-XX-035', 'MKS-XX-036',
];
const BACKUP = path.join(__dirname, 'hide-in-pdf-bilim-kelechek.backup.json');

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');

  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new mongoose.Types.ObjectId(d._id) }, { $set: { hideInPdf: !!d.hideInPdf } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }

  const docs = await col.find({ sku: { $in: SKUS } }, { projection: { sku: 1, name: 1, hideInPdf: 1 } }).toArray();
  const missing = SKUS.filter(s => !docs.some(d => d.sku === s));
  docs.forEach(d => console.log(`${d.sku.padEnd(16)} ${d.name}  hideInPdf: ${!!d.hideInPdf} → true`));
  if (missing.length) { console.error('Не найдены:', missing); process.exit(1); }

  if (!process.argv.includes('--apply')) { console.log(`\nПредпросмотр: ${docs.length} товаров. Запустите с --apply.`); return process.exit(0); }

  fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 1));
  const r = await col.updateMany({ _id: { $in: docs.map(d => d._id) } }, { $set: { hideInPdf: true } });
  console.log(`\nОбновлено: ${r.modifiedCount}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
