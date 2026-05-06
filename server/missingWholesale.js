const mongoose = require('mongoose');
const Product  = require('./models/Product');
const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

async function main() {
  await mongoose.connect(MONGO_URI);
  const products = await Product.find({ brand: 'matkasym-home', price: { $gt: 0 }, $or: [{ priceWholesale: { $exists: false } }, { priceWholesale: 0 }, { priceWholesale: null }] }, 'name category price priceWholesale').lean();
  products.sort((a,b) => a.name.localeCompare(b.name,'ru'));
  products.forEach(p => console.log(`${p.name} | розн: ${p.price}`));
  console.log(`\nИтого без оптовой цены: ${products.length}`);
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
