/**
 * Обновляет остатки товаров из XLS (Основной + Коммерческий склад)
 * Источник: /tmp/stock_map.json — ключ = fullName из 1С, значение = сумма остатков
 * Запуск: node server/updateStock.js [--execute]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product  = require('./models/Product');
const fs       = require('fs');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const EXECUTE   = process.argv.includes('--execute');

function norm(s = '') {
  return s
    .toLowerCase()
    .replace(/[«»"""''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const raw = JSON.parse(fs.readFileSync('/tmp/stock_map.json', 'utf8'));

  // Строим карту: norm(name) → stock
  const stockMap = new Map();
  for (const [key, val] of Object.entries(raw)) {
    stockMap.set(norm(key), val);
  }
  console.log(`📋 Позиций в XLS: ${stockMap.size}`);

  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB подключено\n');

  const products = await Product.find({});
  console.log(`📦 Товаров в БД: ${products.length}\n`);

  let updated = 0, zeroed = 0;
  const notFound = [];

  for (const p of products) {
    const key = norm(p.fullName || p.name || '');
    if (!stockMap.has(key)) {
      notFound.push(p.fullName || p.name || '(пусто)');
      // Обнуляем товары которых нет в Excel
      if (EXECUTE) {
        await Product.updateOne({ _id: p._id }, { $set: { stock: 0, inStock: false, stockStatus: 'out_of_stock' } });
      }
      zeroed++;
      continue;
    }

    const raw  = stockMap.get(key);
    const stock = Math.max(0, raw);
    const inStock    = stock > 0;
    const stockStatus = inStock ? 'in_stock' : 'out_of_stock';

    if (EXECUTE) {
      await Product.updateOne({ _id: p._id }, { $set: { stock, inStock, stockStatus } });
    }
    updated++;
  }

  if (EXECUTE) {
    console.log(`✅ Совпало и обновлено: ${updated} товаров`);
    console.log(`⚪ Обнулено (нет в Excel): ${zeroed} товаров`);
    console.log(`📊 Итого обновлено в БД: ${updated + zeroed} товаров`);
  } else {
    console.log(`⚠️  DRY RUN`);
    console.log(`   Совпало: ${updated} товаров`);
    console.log(`   Будет обнулено: ${zeroed} товаров`);
    console.log('   Запустите с --execute для записи в БД');
  }

  if (notFound.length) {
    console.log(`\n🔴 Не найдены в Excel (${notFound.length}) → будут обнулены:`);
    notFound.slice(0, 30).forEach(n => console.log(`   • ${n}`));
    if (notFound.length > 30) console.log(`   ... и ещё ${notFound.length - 30}`);
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
