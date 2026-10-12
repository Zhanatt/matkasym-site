// Характеристики щитов в линейках KOOZ KOOPSUZDUK (12.10.2026): у части щитов
// была одна строка, и шапка листа в PDF пустовала. Дописываем недостающие —
// из того, что уже записано у большинства щитов линейки, и по самому изделию
// (фото, название). Существующие значения не трогаем, кроме двух выравниваний.
// Без --apply только показывает. --undo откатывает из бэкапа.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { ObjectId } = mongoose.Types;
const BACKUP = path.join(__dirname, 'fill-specs-kooz-ranges.backup.json');

const IP31 = { 'Степень защиты': 'IP31', 'Материал': 'сталь', 'Размещение': 'навесное', 'Покрытие': 'порошковая краска' };
const PLAN = [
  { q: { pdfRange: 'Электрощиты настенные IP31', pdfRangeExtra: { $ne: true } }, add: IP31 },
  { q: { pdfRange: 'Электрощиты IP54' }, add: {
    'Материал': 'сталь холоднокатаная', 'Размещение': 'навесное', 'Уплотнитель двери': 'есть',
    'Покрытие': 'порошковая краска', 'Цвет': 'RAL 7035 (светло-серый)' } },
  { q: { sku: /^MKS-SF-001-/ }, add: {
    'Степень защиты': 'IP30', 'Размещение': 'навесное', 'Покрытие': 'порошковая краска',
    'Цвет': 'светло-серый', 'Дверь': 'одна, с замком' } },
  { q: { sku: /^MKS-SF-001-/, name: /монтажной панелью/ }, add: { 'Монтажная панель': 'есть' } },
  { q: { sku: /^MKS-SF-005-/ }, add: {
    'Степень защиты': 'IP44', 'Размещение': 'навесное, уличное', 'Козырёк': 'есть, от дождя',
    'Вентиляция': 'решётки на боковой стенке', 'Замок': 'ручка с замком' } },
];
// Выравнивание записи, чтобы строка стала общей для линейки
const FIX = [
  { q: { sku: 'MKS-KS-Х65' }, set: { 'Покрытие': 'порошковая краска', 'Цвет': 'RAL 7035 (светло-серый)' } },
  { q: { pdfRange: 'Электрощиты IP54', 'specs.value': 'ral 7035 (светло-серый)' }, set: { 'Цвет': 'RAL 7035 (светло-серый)' } },
];

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new ObjectId(d._id) }, { $set: { specs: d.specs } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const base = { set: 'kooz-koopsuzduk' };
  const touched = new Map();
  const load = async q => (await col.find({ ...base, ...q }, { projection: { name: 1, sku: 1, specs: 1 } }).toArray())
    .map(d => touched.get(String(d._id)) || (touched.set(String(d._id), { ...d, orig: JSON.parse(JSON.stringify(d.specs || [])), specs: d.specs || [], log: [] }), touched.get(String(d._id))));
  const norm = k => String(k || '').trim().toLowerCase();
  for (const { q, add } of PLAN) for (const d of await load(q)) for (const [k, v] of Object.entries(add)) {
    const row = d.specs.find(s => norm(s.key) === norm(k));
    if (row && String(row.value || '').trim()) continue;
    if (row) row.value = v; else d.specs.push({ key: k, value: v, options: [] });
    d.log.push(`+ ${k}: ${v}`);
  }
  for (const { q, set } of FIX) for (const d of await load(q)) for (const [k, v] of Object.entries(set)) {
    const row = d.specs.find(s => norm(s.key) === norm(k));
    if (row && row.value === v) continue;
    d.log.push(`${row ? `~ ${k}: ${row.value} →` : `+ ${k}:`} ${v}`);
    if (row) row.value = v; else d.specs.push({ key: k, value: v, options: [] });
  }
  const changed = [...touched.values()].filter(d => d.log.length);
  changed.forEach(d => console.log(`${(d.sku || '—').padEnd(20)} ${d.name.slice(0, 50)}\n   ${d.log.join('\n   ')}`));
  if (!process.argv.includes('--apply')) { console.log(`\nПредпросмотр: ${changed.length}. Запустите с --apply.`); return process.exit(0); }
  if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, JSON.stringify(changed.map(d => ({ _id: d._id, specs: d.orig })), null, 1));
  for (const d of changed) await col.updateOne({ _id: d._id }, { $set: { specs: d.specs } });
  console.log(`\nОбновлено: ${changed.length}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
