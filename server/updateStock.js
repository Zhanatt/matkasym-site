/**
 * Обновляет остатки товаров из XLS (коммерческий + основной склад)
 * Запуск: node updateStock.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product  = require('./models/Product');
const fs       = require('fs');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

// Нормализует строку для сравнения: нижний регистр, убирает лишние пробелы и кавычки
function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[«»"""''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const stockData = JSON.parse(fs.readFileSync('/tmp/stock_data.json', 'utf8'));

  // Оставляем только строки с ненулевым или явно указанным остатком
  // Строим карту: norm(name) → stock
  const stockMap = new Map();
  for (const row of stockData) {
    stockMap.set(norm(row.name), row.stock);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB Atlas\n');

  const products = await Product.find({ brand: 'matkasym-home' });
  console.log(`📦 Товаров HOME в БД: ${products.length}`);

  let updated = 0;
  let notFound = [];

  // Ручные маппинги: fullName в БД → имя в XLS
  const MANUAL = {
    'matkasym home — r6 (мангал)':                          'эко мангал r 6',
    'matkasym home — r8 (мангал)':                          'эко мангал r 8',
    'matkasym home — r10 (мангал)':                         'эко мангал r10',
    'matkasym home — sanarip 10 (антенна наружная)':        'антенна санарип 10 м',
    'matkasym home — sanarip 15 (антенна наружная)':        'антенна санарип 15 м',
    'matkasym home — sanarip 20 (антенна наружная)':        'антенна санарип 20 м',
    'matkasym home — smart (антенна наружная)':             'антенна смарт 10 м',
    'matkasym home — smart с усилителем (антенна наружная)':'антенна смарт 10 м с усилителем',
    'matkasym home — compact (антенна комнатная)':          'антенна комнатная компакт',
    'matkasym home — sanira e (гладильная доска)':          'гладильная доска с большой подставкой sanira(e)',
    'matkasym home — sanira a (гладильная доска)':          'гладильная доска с двойной ножкой sanira(a)',
    'matkasym home — sanira m (гладильная доска)':          'гладильная доска с железный выдвижной sanira(m)',
    'matkasym home — sanira s (гладильная доска)':          'гладильная доска пластиковой выдвижной sanira(s)',
    'matkasym home — sanira x (гладильная доска)':          'гладильная доска железная sanira(x)',
    'adik home round guardrail m4 (черный)':                'стеллаж металлический adik home guardrail м4 80х35х135',
    'adik home round guardrail m4 (белый)':                 'стеллаж металлический adik home guardrail м4 80х35х135',
    'adik home round guardrail m3 (черный)':                'стеллаж металлический adik home guardrail м3 80х35х95',
    'adik home round guardrail m3 (белый)':                 'стеллаж металлический adik home guardrail м3 80х35х95',
    'adik home slotted a5 (черный)':                        'стеллаж металлический adik home slotted а5 120х40х183',
    'adik home slotted a5 (белый)':                         'стеллаж металлический adik home slotted а5 120х40х183',
    'adik home slotted a3 (черный)':                        'стеллаж металлический adik home slotted а3 120х40х80',
    'adik home slotted a3 (белый)':                         'стеллаж металлический adik home slotted а3 120х40х80',
  };

  for (const p of products) {
    const normFull = norm(p.fullName);
    const normName = norm(p.name);

    let stock = null;

    // 1. Ручной маппинг
    if (MANUAL[normFull] !== undefined) {
      stock = stockMap.get(MANUAL[normFull]) ?? null;
    }

    // 2. Точное совпадение
    if (stock === null) {
      for (const c of [normFull, normName]) {
        if (stockMap.has(c)) { stock = stockMap.get(c); break; }
      }
    }

    // 3. Частичное совпадение
    if (stock === null) {
      for (const [key, val] of stockMap) {
        if (key.length > 5 && (key.includes(normName) || normName.includes(key.replace(/[()]/g, '').trim()))) {
          stock = val;
          break;
        }
      }
    }

    if (stock !== null) {
      const realStock  = Math.max(0, stock); // отрицательные → 0
      const inStock    = realStock > 0;
      const stockStatus = realStock > 0 ? 'in_stock' : 'out_of_stock';

      await Product.updateOne(
        { _id: p._id },
        { $set: { stock: realStock, inStock, stockStatus } }
      );
      updated++;
      if (stock !== 0) {
        console.log(`  ✅ ${p.fullName || p.name} → ${realStock} шт${stock < 0 ? ` (было ${stock})` : ''}`);
      }
    } else {
      notFound.push(p.fullName || p.name);
    }
  }

  console.log(`\n✅ Обновлено: ${updated}`);
  if (notFound.length) {
    console.log(`\n⚠️  Не найдено в XLS (${notFound.length}):`);
    notFound.forEach(n => console.log(`   • ${n}`));
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
