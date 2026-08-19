/**
 * Разделение буферного запаса по базам 1С.
 *
 * Раньше буфер был один на карточку и приходил только из Make-in (минимумы Matkasym
 * отбрасывались, чтобы не затирать общий). Теперь буфер ведётся по базам, как остаток:
 * bufferByBase.{makein,matkasym,qtop}, а bufferStock — их сумма по Кыргызстану.
 *
 * Скрипт переносит прежнее значение в базу Make-in у карточек, где по базам ещё пусто.
 * Сумма не меняется — уведомления и /admin/buffer-stock продолжают считать как раньше,
 * пока следующая выгрузка Matkasym не проставит её собственные минимумы.
 *
 *   node scripts/split-buffer-by-base.js           # показать, что изменится
 *   node scripts/split-buffer-by-base.js --apply   # записать
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(MONGO_URI);

  const products = await Product.find(
    { bufferStock: { $gt: 0 } },
    '_id fullName name sku bufferStock bufferByBase'
  ).lean();

  const todo = products.filter(p => {
    const b = p.bufferByBase || {};
    return !(b.makein || 0) && !(b.matkasym || 0) && !(b.qtop || 0);
  });

  console.log(`Товаров с буфером: ${products.length}, без разбивки по базам: ${todo.length}`);
  todo.slice(0, 20).forEach(p =>
    console.log(`  ${(p.sku || '—').padEnd(20)} ${(p.fullName || p.name || '').slice(0, 50).padEnd(52)} буфер ${p.bufferStock} → Make-in`));
  if (todo.length > 20) console.log(`  … и ещё ${todo.length - 20}`);

  if (!APPLY) {
    console.log('\nСухой прогон. Запустить с --apply, чтобы записать.');
    await mongoose.disconnect();
    return;
  }

  const res = await Product.bulkWrite(todo.map(p => ({
    updateOne: {
      filter: { _id: p._id },
      update: { $set: { 'bufferByBase.makein': p.bufferStock, 'bufferByBase.matkasym': 0, 'bufferByBase.qtop': 0 } },
    },
  })), { ordered: false });

  console.log(`Обновлено карточек: ${res.modifiedCount}`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
