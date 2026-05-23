/**
 * setNelikvidStatus.js
 * Всем товарам с set='nelikvid' ставит productStatus='nelikvid'.
 *
 * Сухой прогон: node setNelikvidStatus.js
 * Реальное:     node setNelikvidStatus.js --execute
 */

const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const EXECUTE   = process.argv.includes('--execute');

async function run() {
  await mongoose.connect(MONGO_URI);

  const products = await Product.find({ set: 'nelikvid' });
  console.log(`Найдено товаров в сете nelikvid: ${products.length}`);

  if (!EXECUTE) {
    products.forEach(p => console.log(`  [dry] ${p.name} — текущий статус: ${p.productStatus}`));
    console.log('\nДобавьте --execute для реального обновления.');
    await mongoose.disconnect();
    return;
  }

  const result = await Product.updateMany(
    { set: 'nelikvid' },
    { $set: { productStatus: 'nelikvid' } }
  );
  console.log(`Обновлено: ${result.modifiedCount} товаров → productStatus = nelikvid`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
