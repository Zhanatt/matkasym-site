const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

async function main() {
  await mongoose.connect(MONGO_URI);
  const products = await Product.find({ brand: 'matkasym-home' }, 'name category priceWholesale price').lean();
  products.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  products.forEach(p => {
    console.log(`${p.name} | кат: ${p.category} | опт: ${p.priceWholesale || '-'} | розн: ${p.price || '-'}`);
  });
  console.log(`\nВсего: ${products.length}`);
  await mongoose.disconnect();
}
main().catch(err => { console.error(err); process.exit(1); });
