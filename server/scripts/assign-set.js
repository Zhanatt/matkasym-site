// Привязка товаров к сету — для карточек, которые завелись из 1С без сета
// и висят в «Каталоге по сетам» в группе «БЕЗ СЕТА».
//
// Запуск (из server/):
//   node scripts/assign-set.js --filter=ADIK --set=baary-oorunda
//   node scripts/assign-set.js --filter=ADIK --set=baary-oorunda --apply
//
// По умолчанию берутся только карточки БЕЗ сета: перекладывать товар из одного
// сета в другой — отдельное решение, случайно этого произойти не должно.
// --with-set  — брать и те, у которых сет уже стоит (тогда он будет заменён).
// --any-stock — брать и карточки с нулевым остатком (по умолчанию только с остатком).
//
// Без --apply ничего не пишется. Перед записью затронутые документы выгружаются
// в scripts/backup-set-<дата>.json.
const fs   = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const arg = (name, def = '') => (process.argv.find(a => a.startsWith(`--${name}=`)) || `--${name}=${def}`).split('=')[1];

const APPLY     = process.argv.includes('--apply');
const WITH_SET  = process.argv.includes('--with-set');
const ANY_STOCK = process.argv.includes('--any-stock');
const FILTER    = arg('filter');
const SET       = arg('set');

if (!FILTER || !SET) {
  console.error('Нужны --filter=<текст в названии> и --set=<slug сета>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(MONGO_URI);

  const re = new RegExp(FILTER, 'i');
  const all = await Product.find({ $or: [{ name: re }, { fullName: re }, { sku: re }] })
    .select('sku name fullName set brand stock images driveImages').lean();

  const targets = all.filter(p => {
    if (!WITH_SET && p.set) return false;
    if (p.set === SET) return false;                       // уже там
    if (!ANY_STOCK && !(Number(p.stock) || 0)) return false;
    return true;
  });

  console.log(`Товаров по фильтру «${FILTER}»: ${all.length}`);
  console.log(`Будет привязано к сету «${SET}»: ${targets.length}\n`);

  for (const p of targets) {
    console.log([
      (p.sku || 'без артикула').padEnd(14),
      (p.brand || '—').padEnd(15),
      `остаток ${String(p.stock ?? 0).padStart(4)}`,
      `сет: ${p.set || '—'} → ${SET}`,
      p.fullName || p.name,
    ].join(' | '));
  }

  // Сколько товаров в этом сете уже есть — по числу видно, туда ли кладём.
  const inSet = await Product.countDocuments({ set: SET });
  console.log(`\nСейчас в сете «${SET}»: ${inSet} товаров, станет ${inSet + targets.length}`);

  if (!APPLY) {
    console.log('\nЭто предпросмотр. Записать: добавьте --apply');
    await mongoose.disconnect();
    return;
  }
  if (!targets.length) { await mongoose.disconnect(); return; }

  const backup = path.join(__dirname, `backup-set-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify(await Product.find({ _id: { $in: targets.map(t => t._id) } }).lean(), null, 2));
  console.log(`\nБэкап: ${backup}`);

  const res = await Product.updateMany({ _id: { $in: targets.map(t => t._id) } }, { $set: { set: SET } });
  console.log(`Обновлено карточек: ${res.modifiedCount}`);

  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
