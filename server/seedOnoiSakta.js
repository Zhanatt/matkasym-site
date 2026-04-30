/**
 * Добавляет стеллажи ADIK HOME в MATKASYM HOME / ONOI SAKTA
 * Запуск: node seedOnoiSakta.js
 */
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

const BASE = {
  brand: 'matkasym-home',
  set:   'onoi-sakta',
  category: 'metal-shelf',
  price: 0, priceWholesale: 0, priceDealer: 0, priceCost: 0,
  inStock: false, stock: 0, stockStatus: 'out_of_stock',
  productStatus: 'planned',
  isNew: false, rating: 0, reviewCount: 0,
};

// helper: цвет строкой → код
const COLOR = { 'Черный': 'black', 'Белый': 'white' };

// [modelName, тип стоек]
const MODELS = [
  // ROUND серия — круглые стойки
  ['ADIK HOME ROUND X5',          'round (круглые)'],
  ['ADIK HOME ROUND X4',          'round (круглые)'],
  ['ADIK HOME ROUND X3',          'round (круглые)'],
  ['ADIK HOME ROUND S4',          'round (круглые)'],
  ['ADIK HOME ROUND S3',          'round (круглые)'],
  ['ADIK HOME ROUND GUARDRAIL M4','round (круглые)'],
  ['ADIK HOME ROUND GUARDRAIL M3','round (круглые)'],
  // SLOTTED серия — перфорированные стойки
  ['ADIK HOME SLOTTED A5',        'slotted (перфорированные)'],
  ['ADIK HOME SLOTTED A3',        'slotted (перфорированные)'],
  ['ADIK HOME SLOTTED B3',        'slotted (перфорированные)'],
];

const PRODUCTS = MODELS.flatMap(([modelName, postType]) =>
  ['Черный', 'Белый'].map(colorRu => ({
    ...BASE,
    name:     modelName,
    fullName: `${modelName} (${colorRu})`,
    color:    COLOR[colorRu],
    specs: [
      { key: 'Тип стоек',   value: postType },
      { key: 'Цвет',        value: colorRu },
      { key: 'Конструкция', value: 'разборно-сборная' },
    ],
  }))
);

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB Atlas\n');

  // Удаляем старые записи этого сета (на случай повторного запуска)
  const del = await Product.deleteMany({ brand: 'matkasym-home', set: 'onoi-sakta' });
  console.log(`🗑  Удалено старых записей onoi-sakta: ${del.deletedCount}`);

  await Product.insertMany(PRODUCTS);
  console.log(`✅ Добавлено товаров: ${PRODUCTS.length}`);

  PRODUCTS.forEach(p => console.log(`   • ${p.fullName}`));

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
