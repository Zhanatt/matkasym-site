// Большие баки 0-TASHTANDY — в PDF одним листом, по две карточки в ряд (12.10.2026):
// пластиковый 1100, Tazalyk 660, Tazalyk в цветах, Tazalyk с крышкой, Ecomayak.
// Жёлтый сетчатый Tazalyk R 1100 L из PDF убран (hideInPdf), на сайте остаётся.
// Порядок — pdf-order-0-tashtandy.js. Без --apply только показывает. --undo откатывает.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const BACKUP = path.join(__dirname, 'pdf-page-bins-0-tashtandy.backup.json');
const PAGE = 'Баки 0-TASHTANDY';
const HIDE = ['MKS-СЗ0239'];

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new mongoose.Types.ObjectId(d._id) }, { $set: { pdfPage: d.pdfPage || '', hideInPdf: Boolean(d.hideInPdf) } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const page = await col.find({ set: '0-tashtandy', $or: [
    { sku: { $in: ['MKS-UT-028', 'СЗ0055'] } },
    { name: /^Мусорный бак «Tazalyk»/, pdfOrder: { $ne: null } },
    { name: /Ecomayak/ },
  ] }, { projection: { sku: 1, name: 1, pdfPage: 1, hideInPdf: 1, pdfOrder: 1 } }).sort({ pdfOrder: 1 }).toArray();
  const hide = await col.find({ set: '0-tashtandy', sku: { $in: HIDE } }, { projection: { sku: 1, name: 1, pdfPage: 1, hideInPdf: 1 } }).toArray();
  page.forEach(d => console.log(`лист   ${String(d.pdfOrder ?? '—').padStart(3)} ${(d.sku || '—').padEnd(14)} ${d.name}`));
  hide.forEach(d => console.log(`скрыть     ${(d.sku || '—').padEnd(14)} ${d.name}`));
  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }
  if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, JSON.stringify([...page, ...hide], null, 1));
  await col.updateMany({ _id: { $in: page.map(d => d._id) } }, { $set: { pdfPage: PAGE } });
  await col.updateMany({ _id: { $in: hide.map(d => d._id) } }, { $set: { hideInPdf: true } });
  console.log(`\nНа лист: ${page.length}, скрыто: ${hide.length}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
