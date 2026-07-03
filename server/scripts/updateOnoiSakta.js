const mongoose = require('mongoose');
const Product = require('../models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym';

async function updateProducts() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Обновить все товары ONOI SAKTA - поставить "под заказ"
    const result1 = await Product.updateMany(
      { set: 'onoi-sakta' },
      { $set: { isOnOrder: true, stock: 0 } }
    );
    console.log(`Updated ${result1.modifiedCount} products to "под заказ"`);

    // Выделить автоматизированные в отдельную категорию
    const result2 = await Product.updateMany(
      {
        set: 'onoi-sakta',
        sku: { $in: ['OS-ASRS', 'OS-SHUTTLE-SYS'] }
      },
      { $set: { category: 'Автоматизированные склады' } }
    );
    console.log(`Updated ${result2.modifiedCount} products to "Автоматизированные склады" category`);

    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateProducts();
