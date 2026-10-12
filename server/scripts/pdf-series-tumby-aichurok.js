// Тумбы AICHUROK — в PDF сериями по виду: T, TP, TR, TSh (12.10.2026), как шкафы.
// Серия — вид тумбы после «AICHUROK» без числа ящиков и габаритов:
// «T 3 - H1031×460×620» → серия T, подпись «T 3».
// Без --apply только показывает. --apply пишет бэкап. --undo откатывает.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { ObjectId } = mongoose.Types;
const BACKUP = path.join(__dirname, 'pdf-series-tumby-aichurok.backup.json');

function parse(name) {
  const m = String(name).match(/^Тумба AICHUROK\s+(.+?)\s*-\s*H/);
  if (!m) return null;
  const code = m[1].trim();
  const tokens = code.split(/\s+/);
  while (tokens.length > 1 && /^(\d+|H|K|Z|ZY)$/.test(tokens[tokens.length - 1])) tokens.pop();
  return { series: `Тумба AICHUROK ${tokens.join(' ')}`, variant: code };
}

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new ObjectId(d._id) }, { $set: { pdfSeries: d.pdfSeries || '', pdfVariant: d.pdfVariant || '' } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const docs = await col.find({ name: /^Тумба AICHUROK /, brand: 'matkasym-shaar' },
    { projection: { name: 1, stock: 1, pdfSeries: 1, pdfVariant: 1, pdfGroup: 1 } }).sort({ name: 1 }).toArray();
  const plan = docs.map(d => ({ d, ...parse(d.name) })).filter(x => x.series);
  const bySeries = {};
  plan.forEach(x => (bySeries[x.series] ||= []).push(`${x.variant}${x.d.stock > 0 ? '' : ' (нет в наличии)'}`));
  Object.entries(bySeries).forEach(([s, v]) => console.log(`${s}: ${v.join(', ')}`));
  if (plan.some(x => x.d.pdfGroup)) console.warn('Внимание: у части уже есть pdfGroup');
  if (!process.argv.includes('--apply')) { console.log(`\nПредпросмотр: ${plan.length} тумб. Запустите с --apply.`); return process.exit(0); }
  fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 1));
  for (const x of plan) await col.updateOne({ _id: x.d._id }, { $set: { pdfSeries: x.series, pdfVariant: x.variant } });
  console.log(`\nОбновлено: ${plan.length}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
