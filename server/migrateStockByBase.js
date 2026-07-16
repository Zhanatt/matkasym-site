/**
 * Разовая миграция: текущий stock — это остаток из базы Make-in.
 * Проставляем его в stockByBase.makein, остальные базы оставляем нулями,
 * чтобы stock (сумма по базам) сошёлся с тем, что уже показывает сайт.
 *
 * Запуск: node migrateStockByBase.js [--apply]
 * Без --apply только показывает, что будет сделано.
 */
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = process.env.MONGO_URI ||
  'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(MONGO_URI);

  const products = await Product.find({}, '_id name fullName stock stockByBase').lean();
  const todo = products.filter(p => (p.stockByBase?.makein || 0) !== (p.stock || 0));

  console.log(`Товаров всего: ${products.length}`);
  console.log(`Требуют проставки stockByBase.makein: ${todo.length}`);
  console.log(`Суммарный остаток: ${products.reduce((n, p) => n + (p.stock || 0), 0)} шт`);

  if (!APPLY) {
    console.log('\nПримеры (первые 10):');
    todo.slice(0, 10).forEach(p => console.log(`  · ${(p.fullName || p.name).slice(0, 50)} — stock ${p.stock} → stockByBase.makein`));
    console.log('\nЭто сухой прогон. Для записи: node migrateStockByBase.js --apply');
    await mongoose.disconnect();
    return;
  }

  const ops = todo.map(p => ({
    updateOne: { filter: { _id: p._id }, update: { $set: { 'stockByBase.makein': p.stock || 0 } } },
  }));
  if (ops.length) {
    const r = await Product.bulkWrite(ops, { ordered: false });
    console.log(`\n✅ Обновлено: ${r.modifiedCount}`);
  } else {
    console.log('\nНечего обновлять.');
  }
  await mongoose.disconnect();
})();
