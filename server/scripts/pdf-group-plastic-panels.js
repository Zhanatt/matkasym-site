// Пластиковые электрощиты KOOZ KOOPSUZDUK — в PDF по одной карточке на тип
// (встраиваемые SF-008, накладные SF-007), размеры строками с ценой (12.10.2026).
// Без --apply только показывает. --apply пишет бэкап. --undo откатывает.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { ObjectId } = mongoose.Types;
const BACKUP = path.join(__dirname, 'pdf-group-plastic-panels.backup.json');

const GROUPS = {
  'MKS-SF-008-': 'Электрощит пластиковый встраиваемый IP40',
  'MKS-SF-007-': 'Электрощит пластиковый накладной IP40',
};
const LABEL = { '12M': '12 модулей', '18M': '18 модулей', '24M': '24 модуля, 2 ряда', '36M': '36 модулей, 2 ряда' };

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new ObjectId(d._id) }, { $set: { pdfGroup: d.pdfGroup || '', pdfVariant: d.pdfVariant || '' } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const docs = await col.find({ sku: /^MKS-SF-00[78]-(12|18|24|36)M$/ }, { projection: { sku: 1, name: 1, price: 1, pdfGroup: 1, pdfVariant: 1 } }).sort({ sku: 1 }).toArray();
  const plan = docs.map(d => {
    const prefix = Object.keys(GROUPS).find(p => d.sku.startsWith(p));
    return { d, group: GROUPS[prefix], variant: LABEL[d.sku.slice(prefix.length)] };
  });
  plan.forEach(x => console.log(`${x.d.sku.padEnd(16)} → «${x.group}» / «${x.variant}» (${x.d.price} сом)`));
  if (plan.length !== 8 || plan.some(x => !x.variant)) { console.error('Ожидалось 8 щитов'); process.exit(1); }
  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }
  fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 1));
  for (const x of plan) await col.updateOne({ _id: x.d._id }, { $set: { pdfGroup: x.group, pdfVariant: x.variant } });
  console.log(`\nОбновлено: ${plan.length}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
