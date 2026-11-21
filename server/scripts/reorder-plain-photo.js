/**
 * Фото товара без фона — первым, как в сете «Ачык асман».
 *
 * Запуск из папки server:
 *   node scripts/reorder-plain-photo.js            — показать, что изменится
 *   node scripts/reorder-plain-photo.js --apply    — записать
 *
 * Снимок на белом фоне обычно лежит в конце галереи, а на витрине и в постах
 * первым идёт кадр из интерьера. План перестановки считается отдельно (по самим
 * картинкам: фон, прозрачность, отсев технических чертежей) и лежит в
 * data/bg-first-photo-plan.json — здесь только запись.
 *
 * Порядок сверяется с базой: если у товара с момента подсчёта поменялся набор
 * фото, он пропускается — иначе перестановка перемешала бы уже другую галерею.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const APPLY = process.argv.includes('--apply');
const PLAN  = path.join(__dirname, '..', 'data', 'bg-first-photo-plan.json');

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

(async () => {
  const { plan } = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
  await mongoose.connect(MONGO_URI);
  const products = mongoose.connection.db.collection('products');

  const todo = [], done = [], changed = [], missing = [];

  for (const row of plan) {
    const p = await products.findOne({ _id: new mongoose.Types.ObjectId(row._id) },
                                     { projection: { images: 1, name: 1 } });
    if (!p)                                  { missing.push(row.name); continue; }
    if (!sameSet(p.images || [], row.images)) { changed.push(row.name); continue; }
    if (p.images[0] === row.images[0])        { done.push(row.name);    continue; }
    todo.push({ ...row, before: p.images });
  }

  console.log(`в плане: ${plan.length}`);
  console.log(`переставить: ${todo.length}`);
  console.log(`уже первым: ${done.length}`);
  if (changed.length) console.log(`пропущено, фото изменились: ${changed.length} — ${changed.slice(0, 5).join('; ')}`);
  if (missing.length) console.log(`не найдено в базе: ${missing.length}`);

  const bySet = {};
  todo.forEach(r => { bySet[r.set] = (bySet[r.set] || 0) + 1; });
  console.log('по сетам:', bySet);
  console.log('\nпримеры:');
  todo.slice(0, 8).forEach(r => console.log(`   ${r.set.padEnd(14)} ${r.name.slice(0, 46).padEnd(48)} #${r.from} → #1`));

  if (!APPLY) { console.log('\nПредпросмотр. Запусти с --apply.'); await mongoose.disconnect(); return; }
  if (!todo.length) { console.log('\nНечего менять.'); await mongoose.disconnect(); return; }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const backup = path.join(__dirname, `backup-photo-order-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(todo.map(r => ({ _id: r._id, name: r.name, images: r.before })), null, 1));
  console.log(`\nпрежний порядок сохранён: ${path.basename(backup)}`);

  for (const r of todo) {
    await products.updateOne({ _id: new mongoose.Types.ObjectId(r._id) },
      { $set: { images: r.images, updatedAt: new Date() } });
  }
  console.log(`✔ переставлено: ${todo.length}`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
