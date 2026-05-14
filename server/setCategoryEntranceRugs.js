// Migration: assign category 'entrance-rugs' to all hallway rug products
// Run: node server/setCategoryEntranceRugs.js

require('dotenv').config();
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Match all products whose name contains "прихожей" (case-insensitive)
  const result = await Product.updateMany(
    { $or: [
      { name:     { $regex: 'прихожей', $options: 'i' } },
      { fullName: { $regex: 'прихожей', $options: 'i' } },
    ]},
    { $set: { category: 'entrance-rugs' } }
  );

  console.log(`Updated ${result.modifiedCount} products → category: 'entrance-rugs'`);

  // Show what was updated
  const products = await Product.find(
    { category: 'entrance-rugs' },
    'name fullName'
  ).sort({ name: 1 });
  products.forEach(p => console.log(' -', p.fullName || p.name));

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
