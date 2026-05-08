/**
 * Обновляет остатки товаров из Excel-файла остатков 1С
 * Суммирует: Основной склад (col 4) + Коммерческий склад (col 19)
 * Запуск: node server/updateStockFromExcel.js <путь_к_файлу.xlsx> [--execute]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product  = require('./models/Product');
const xlsx     = require('xlsx');
const path     = require('path');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const EXECUTE   = process.argv.includes('--execute');
const FILE_PATH = process.argv.find(a => a.endsWith('.xlsx'));

if (!FILE_PATH) {
  console.error('❌ Укажите путь к Excel файлу: node updateStockFromExcel.js файл.xlsx [--execute]');
  process.exit(1);
}

function norm(s = '') {
  return s
    .toLowerCase()
    .replace(/[«»"""''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNum(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : Math.max(0, Math.floor(n));
}

function parseExcel(filePath) {
  const wb = xlsx.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Row 6 (index 5) — warehouse headers, row 7 (index 6) — sub-headers
  // Data starts at row 8 (index 7)
  // Col 0  — name
  // Col 4  — Основной склад → Остаток
  // Col 19 — Коммерческий склад → Остаток

  const stockMap = new Map();

  for (let i = 7; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[0] || '').trim();
    if (!name) continue;

    // Skip rows that look like group headers:
    // Group rows have a name but col[4] and col[19] are empty (or both are aggregates)
    // A product row has either a number or 0 in col 4/19
    // We detect group rows by checking if ALL stock columns are empty string
    const osnovnoy      = row[4];
    const kommercheskiy = row[19];

    // If both are empty → group header row, skip
    if (osnovnoy === '' && kommercheskiy === '') continue;

    const osnNum  = toNum(osnovnoy);
    // If коммерческий содержит дробное число — это не остаток (артефакт 1С), игнорируем
    const kommRaw = Number(kommercheskiy);
    const kommNum = (!isNaN(kommRaw) && Number.isInteger(kommRaw)) ? Math.max(0, kommRaw) : 0;

    const stock = osnNum + kommNum;
    stockMap.set(norm(name), { name, stock });
  }

  return stockMap;
}

async function main() {
  const absPath = path.resolve(FILE_PATH);
  console.log(`📂 Читаю файл: ${absPath}`);

  const stockMap = parseExcel(absPath);
  console.log(`📋 Позиций в Excel (с ненулевыми строками): ${stockMap.size}`);

  // Show sample
  let sample = 0;
  for (const [key, { name, stock }] of stockMap) {
    if (sample++ < 5) console.log(`   • "${name}" → ${stock} шт.`);
  }
  if (stockMap.size > 5) console.log(`   ... и ещё ${stockMap.size - 5}`);

  await mongoose.connect(MONGO_URI);
  console.log('\n✅ MongoDB подключено');

  const products = await Product.find({});
  console.log(`📦 Товаров в БД: ${products.length}\n`);

  let matched = 0, zeroed = 0;
  const notFound = [];

  for (const p of products) {
    const key = norm(p.fullName || p.name || '');
    const entry = stockMap.get(key);

    if (!entry) {
      notFound.push(p.fullName || p.name || '(пусто)');
      if (EXECUTE) {
        await Product.updateOne({ _id: p._id }, { $set: { stock: 0, inStock: false, stockStatus: 'out_of_stock' } });
      }
      zeroed++;
      continue;
    }

    const stock = entry.stock;
    const inStock     = stock > 0;
    const stockStatus = inStock ? 'in_stock' : 'out_of_stock';

    if (EXECUTE) {
      await Product.updateOne({ _id: p._id }, { $set: { stock, inStock, stockStatus } });
      console.log(`   ✔ ${p.fullName || p.name} → ${stock} шт.`);
    } else {
      console.log(`   [dry] ${p.fullName || p.name} → ${stock} шт.`);
    }
    matched++;
  }

  console.log('');
  if (EXECUTE) {
    console.log(`✅ Совпало и обновлено: ${matched} товаров`);
    console.log(`⚪ Обнулено (нет в Excel): ${zeroed} товаров`);
    console.log(`📊 Итого обновлено в БД: ${matched + zeroed} товаров`);
  } else {
    console.log(`⚠️  DRY RUN (без --execute — ничего не записано)`);
    console.log(`   Совпадёт и обновится: ${matched} товаров`);
    console.log(`   Будет обнулено (нет в Excel): ${zeroed} товаров`);
    console.log('   Запустите с --execute для записи в БД');
  }

  if (notFound.length) {
    console.log(`\n🔴 Не найдены в Excel (${notFound.length}):`);
    notFound.slice(0, 30).forEach(n => console.log(`   • ${n}`));
    if (notFound.length > 30) console.log(`   ... и ещё ${notFound.length - 30}`);
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
