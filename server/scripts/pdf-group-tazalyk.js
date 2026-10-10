// Баки «Tazalyk» 1100 л без крышки — в PDF одной карточкой, цвета строкой (10.10.2026).
// Без --apply только показывает. --apply пишет бэкап и ставит pdfGroup. --undo откатывает.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const GROUP = 'Мусорный бак «Tazalyk»';
const NAMES = [
  'Мусорный бак «Tazalyk» (Зеленый)',
  'Мусорный бак «Tazalyk» (Темно-серый)',
  'Мусорный бак «Tazalyk» (Синий)',
  'Мусорный бак «Tazalyk» без крышки  (Желтый)',
];
const BACKUP = path.join(__dirname, 'pdf-group-tazalyk.backup.json');

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');

  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new mongoose.Types.ObjectId(d._id) }, { $set: { pdfGroup: d.pdfGroup || '' } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }

  const docs = await col.find({ name: { $in: NAMES }, set: '0-tashtandy' }, { projection: { sku: 1, name: 1, pdfGroup: 1 } }).toArray();
  docs.forEach(d => console.log(`${(d.sku || '—').padEnd(14)} ${d.name}  pdfGroup: «${d.pdfGroup || ''}» → «${GROUP}»`));
  if (docs.length !== NAMES.length) { console.error(`Найдено ${docs.length} из ${NAMES.length}`); process.exit(1); }
  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }

  fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 1));
  const r = await col.updateMany({ _id: { $in: docs.map(d => d._id) } }, { $set: { pdfGroup: GROUP } });
  console.log(`\nОбновлено: ${r.modifiedCount}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
