// Освещение MAZZA SEYIL — в PDF одним листом (12.10.2026): 5 фонарей не делятся
// на 4 + 1, пятый не остаётся один на листе. Без --apply только показывает. --undo откатывает.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const BACKUP = path.join(__dirname, 'pdf-page-lights-mazza.backup.json');
const PAGE = 'Освещение MAZZA SEYIL';

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new mongoose.Types.ObjectId(d._id) }, { $set: { pdfPage: d.pdfPage || '' } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const docs = await col.find({ set: 'mazza-seyil', category: { $in: ['Ландшафтное освещение', 'Остальное освещение'] } },
    { projection: { sku: 1, name: 1, category: 1, pdfPage: 1, stock: 1 } }).toArray();
  docs.forEach(d => console.log(`${(d.sku || '—').padEnd(14)} ${d.name.padEnd(28)} ${d.category}, остаток ${d.stock}`));
  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }
  if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 1));
  await col.updateMany({ _id: { $in: docs.map(d => d._id) } }, { $set: { pdfPage: PAGE } });
  console.log(`\nОбновлено: ${docs.length}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
