// Стеллажи ADIK STORAGE MEDIUM 200х60х200 — в PDF одной карточкой (10.10.2026).
// Без --apply только показывает. --apply пишет бэкап и ставит pdfGroup. --undo откатывает.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { ObjectId } = mongoose.Types;

const GROUP = 'Стеллаж ADIK STORAGE MEDIUM 200х60х200';
const IDS = ['69f2d85050420bce3b53b756', '6a7b07cd0208e7449cb0940c', '6a7ec10d65f3c690d0e5d4a6'];
const BACKUP = path.join(__dirname, 'pdf-group-adik-medium.backup.json');

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new ObjectId(d._id) }, { $set: { pdfGroup: d.pdfGroup || '' } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const docs = await col.find({ _id: { $in: IDS.map(i => new ObjectId(i)) } }, { projection: { name: 1, price: 1, pdfGroup: 1 } }).toArray();
  docs.forEach(d => console.log(`${d.name} (${d.price})  → «${GROUP}»`));
  if (docs.length !== IDS.length) { console.error('Найдены не все'); process.exit(1); }
  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }
  fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 1));
  const r = await col.updateMany({ _id: { $in: docs.map(d => d._id) } }, { $set: { pdfGroup: GROUP } });
  console.log(`Обновлено: ${r.modifiedCount}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
