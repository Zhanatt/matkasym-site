/**
 * Названия труб в каталоге — как в номенклатуре 1С.
 *
 * Запуск из папки server:
 *   node scripts/rename-tubes-to-1c.js "<файл ведомости>.xlsx"           — показать план
 *   node scripts/rename-tubes-to-1c.js "<файл ведомости>.xlsx" --apply   — переименовать
 *
 * Каталог и 1С называют одну трубу по-разному («Труба круглая 25×0,9» против
 * «ПФ Труба Ф25*0,9мм»), поэтому пару находим по геометрии — форма, сечение,
 * толщина стенки (lib/tubes.js), а не по тексту.
 *
 * Остатки от переименования не зависят: загрузка базы «Matkasym Трубы» ищет
 * трубу тем же ключом. Скрипт нужен там, где имя показывают человеку —
 * чтобы карточка называлась ровно так, как её просят на складе.
 *
 * Прежние названия сохраняются в scripts/backups/tube-names-<timestamp>.json.
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { parseTurnoverRows, normName, BASES } = require('../lib/stockBases');
const { keyOfName, pipesOf } = require('../lib/tubes');

const APPLY = process.argv.includes('--apply');
const FILE  = process.argv.slice(2).find(a => !a.startsWith('--'));

(async () => {
  if (!FILE) { console.error('Укажите файл оборотной ведомости'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI || require('../lib/atlas'));

  const wb   = xlsx.read(fs.readFileSync(FILE));
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const { stockMap } = parseTurnoverRows(rows, normName);

  const products = await Product.find({ set: BASES.tubes.set }, 'name fullName').lean();
  const byKey = new Map();
  for (const p of products) {
    const k = keyOfName(p.fullName || p.name);
    if (k && !byKey.has(k)) byKey.set(k, p);
  }

  const plan = [];
  const orphans = [];
  for (const row of stockMap.values()) {
    const key = keyOfName(row.name);
    const p   = key && byKey.get(key);
    if (!p) { orphans.push(row); continue; }
    if ((p.name || '') === row.name && (p.fullName || '') === row.name) continue;
    plan.push({ p, to: row.name, meters: row.stock });
  }

  for (const { p, to, meters } of plan) {
    console.log(`${APPLY ? '✔' : '→'}  «${p.fullName || p.name}»  →  «${to}»   ${meters} м · ${pipesOf(meters)} труб`);
  }
  console.log(`\nпереименовать: ${plan.length}`);
  if (orphans.length) {
    console.log(`\nв ведомости есть, а карточки нет — ${orphans.length}:`);
    for (const o of orphans) console.log(`   · ${o.name}  ${o.stock} м`);
  }

  if (!APPLY) { console.log('\nЭто план. Чтобы записать — тот же запуск с --apply'); await mongoose.disconnect(); return; }
  if (!plan.length) { await mongoose.disconnect(); return; }

  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `tube-names-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(plan.map(x => ({ _id: x.p._id, name: x.p.name, fullName: x.p.fullName })), null, 2));
  console.log(`\nпрежние названия: ${backup}`);

  await Product.bulkWrite(plan.map(({ p, to }) => ({
    updateOne: { filter: { _id: p._id }, update: { $set: { name: to, fullName: to } } },
  })), { ordered: false });
  console.log(`переименовано: ${plan.length}`);
  await mongoose.disconnect();
})();
