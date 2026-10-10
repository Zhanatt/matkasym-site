// Кронштейны для кондиционера MINI / MIDDLE / MAX — в PDF одной карточкой,
// размеры строками с ценой (10.10.2026). Без --apply только показывает.
// --apply пишет бэкап и ставит pdfGroup/pdfVariant. --undo откатывает.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const GROUP = 'Кронштейн для кондиционера';
const VARIANTS = { 'MKS-BF-014': 'MINI 7-9', 'MKS-BF-013': 'MIDDLE 12', 'MKS-BF-010': 'MAX 18' };
const BACKUP = path.join(__dirname, 'pdf-group-brackets.backup.json');

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');

  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new mongoose.Types.ObjectId(d._id) },
      { $set: { pdfGroup: d.pdfGroup || '', pdfVariant: d.pdfVariant || '' } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }

  const docs = await col.find({ sku: { $in: Object.keys(VARIANTS) } }, { projection: { sku: 1, name: 1, price: 1, pdfGroup: 1, pdfVariant: 1 } }).toArray();
  docs.forEach(d => console.log(`${d.sku.padEnd(12)} ${d.name}  → «${GROUP}» / «${VARIANTS[d.sku]}» (${d.price} сом)`));
  if (docs.length !== 3) { console.error(`Найдено ${docs.length} из 3`); process.exit(1); }
  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }

  fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 1));
  for (const d of docs) await col.updateOne({ _id: d._id }, { $set: { pdfGroup: GROUP, pdfVariant: VARIANTS[d.sku] } });
  console.log(`\nОбновлено: ${docs.length}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
