// Урна «Ecomayak» — в PDF одной карточкой, цвета кружками (12.10.2026).
// У красной нет фото и цены: фото и цена берутся у зелёной. Красной ставим
// pdfOrder сразу за зелёной (последней в 0-TASHTANDY).
// Без --apply только показывает. --undo откатывает.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const GROUP = 'Мусорная урна «Ecomayak»';
const NAMES = ['Мусорная урна "Ecomayak" (Зеленая)', 'Мусорная урна "Ecomayak" (Красная)'];
const BACKUP = path.join(__dirname, 'pdf-group-ecomayak.backup.json');

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new mongoose.Types.ObjectId(d._id) }, { $set: { pdfGroup: d.pdfGroup || '', pdfOrder: d.pdfOrder ?? null } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const docs = await col.find({ name: { $in: NAMES }, set: '0-tashtandy' }, { projection: { sku: 1, name: 1, pdfGroup: 1, pdfOrder: 1 } }).toArray();
  if (docs.length !== NAMES.length) { console.error(`Найдено ${docs.length} из ${NAMES.length}`); process.exit(1); }
  const green = docs.find(d => /Зеленая/.test(d.name));
  docs.forEach(d => console.log(`${(d.sku || '—').padEnd(14)} ${d.name}  → «${GROUP}», pdfOrder ${d === green ? d.pdfOrder : (green.pdfOrder ?? 0) + 1}`));
  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }
  if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 1));
  for (const d of docs) {
    const set = { pdfGroup: GROUP };
    if (d !== green) set.pdfOrder = (green.pdfOrder ?? 0) + 1;
    await col.updateOne({ _id: d._id }, { $set: set });
  }
  console.log(`\nОбновлено: ${docs.length}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
