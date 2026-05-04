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

  let updated = 0;
  const notFound = [];

  for (const p of products) {
    const key = norm(p.fullName || p.name || '');
    if (!stockMap.has(key)) {
      notFound.push(p.fullName || p.name || '(пусто)');
      continue;
    }

    const raw  = stockMap.get(key);
    const stock = Math.max(0, raw);           // отрицательный → 0
    const inStock    = stock > 0;
    const stockStatus = inStock ? 'in_stock' : 'out_of_stock';

    if (EXECUTE) {
      await Product.updateOne({ _id: p._id }, { $set: { stock, inStock, stockStatus } });
    }
    updated++;
  }

  if (EXECUTE) {
    console.log(`✅ Обновлено: ${updated} товаров`);
  } else {
    console.log(`⚠️  DRY RUN — совпало: ${updated} товаров`);
    console.log('   Запустите с --execute для записи в БД');
  }

  if (notFound.length) {
    console.log(`\n🔴 Не найдены в XLS (${notFound.length}):`);
    notFound.slice(0, 40).forEach(n => console.log(`   • ${n}`));
    if (notFound.length > 40) console.log(`   ... и ещё ${notFound.length - 40}`);
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
