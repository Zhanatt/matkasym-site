/**
 * Импорт исторических остатков из "Остаки (мейкин).xlsx"
 * Каждый лист = один день. Вычисляет дельты между соседними днями
 * и вставляет StockLog записи с правильными датами.
 *
 * Запуск: node server/importMeykinStock.js <путь_к_файлу.xlsx> [--execute]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const xlsx     = require('xlsx');
const path     = require('path');
const Product  = require('./models/Product');
const StockLog = require('./models/StockLog');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const EXECUTE   = process.argv.includes('--execute');
const FILE_PATH = process.argv.find(a => a.endsWith('.xlsx'));

if (!FILE_PATH) {
  console.error('Укажите путь к Excel: node importMeykinStock.js файл.xlsx [--execute]');
  process.exit(1);
}

function normName(s = '') {
  return s.toLowerCase().replace(/[«»"""''`]/g, '').replace(/\s+/g, ' ').trim();
}

function toInt(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : Math.max(0, Math.floor(n));
}

// "20.04.26" or "29.0426" → "2026-04-20"
function parseSheetDate(sheetName) {
  const digits = sheetName.replace(/[^0-9]/g, '');
  const day    = digits.slice(0, 2);
  const month  = digits.slice(2, 4);
  const year   = '20' + digits.slice(4, 6);
  return `${year}-${month}-${day}`;
}

function parseSheet(ws) {
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Auto-detect header row (has "Наименование" in col 0)
  let headerRow = 4; // default row index (0-based)
  for (let ri = 0; ri <= 8; ri++) {
    if (String((rows[ri] || [])[0] || '').includes('Наименование')) {
      headerRow = ri;
      break;
    }
  }
  const dataStart = headerRow + 3; // skip header + Дебет + Количество/Сумма rows

  // Find second table offset (Коммерческий склад starts after empty col)
  let col2Offset = -1; // -1 = no second table
  const hrow = rows[headerRow] || [];
  for (let c = 5; c < hrow.length; c++) {
    if (String(hrow[c] || '').includes('Наименование')) {
      col2Offset = c;
      break;
    }
  }

  const stockMap = new Map(); // normName → qty

  for (let ri = dataStart; ri < rows.length; ri++) {
    const row  = rows[ri];
    if (!row || row.length === 0) continue;

    // Left table (Основной склад)
    const name1 = String(row[0] || '').trim();
    const unit1 = row[1];
    if (name1 && unit1) { // unit present = leaf product row
      const qty = toInt(row[4]); // Сальдо конец → Количество
      const key = normName(name1);
      stockMap.set(key, (stockMap.get(key) || 0) + qty);
    }

    // Right table (Коммерческий склад), if present
    if (col2Offset > 0) {
      const name2 = String(row[col2Offset] || '').trim();
      const unit2 = row[col2Offset + 1];
      if (name2 && unit2) {
        const qty = toInt(row[col2Offset + 4]); // Сальдо конец → Количество
        const key = normName(name2);
        stockMap.set(key, (stockMap.get(key) || 0) + qty);
      }
    }
  }

  return stockMap;
}

async function main() {
  const absPath    = path.resolve(FILE_PATH);
  const sourceUrl  = `import:мейкин:${path.basename(FILE_PATH)}`;
  console.log(`📂 Читаю файл: ${absPath}`);

  const wb = xlsx.readFile(absPath);
  console.log(`📋 Листов: ${wb.SheetNames.length} (${wb.SheetNames.join(', ')})\n`);

  // Parse all sheets into sorted array of { date, stockMap }
  const days = wb.SheetNames.map(name => ({
    name,
    date: parseSheetDate(name),
    stockMap: parseSheet(wb.Sheets[name]),
  })).sort((a, b) => a.date.localeCompare(b.date));

  console.log('Даты (отсортировано):');
  days.forEach(d => console.log(`  ${d.date}  (лист "${d.name}", ${d.stockMap.size} позиций)`));
  console.log();

  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB подключено\n');

  const products = await Product.find({}, '_id fullName name sku');
  const byNorm   = new Map(products.map(p => [normName(p.fullName || p.name || ''), p]));
  console.log(`📦 Товаров в БД: ${products.length}\n`);

  let totalDocs = 0, totalMatched = 0;
  const allDocs = [];

  // For each consecutive pair of days, compute deltas
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1];
    const curr = days[i];

    // All product names seen in either day
    const allKeys = new Set([...prev.stockMap.keys(), ...curr.stockMap.keys()]);

    let dayMatched = 0, dayDocs = 0;
    for (const key of allKeys) {
      const fromStock = prev.stockMap.get(key) ?? 0;
      const toStock   = curr.stockMap.get(key) ?? 0;
      const delta     = toStock - fromStock;
      if (delta === 0) continue;

      const product = byNorm.get(key);
      if (!product) continue; // not in our DB

      dayMatched++;
      dayDocs++;
      allDocs.push({
        productId:   product._id,
        productName: product.fullName || product.name || '',
        sku:         product.sku || '',
        delta,
        fromStock,
        toStock,
        source:    'excel',
        sourceUrl,
        changedBy: { name: 'Импорт: Мейкин' },
        createdAt: new Date(`${curr.date}T12:00:00.000Z`),
        updatedAt: new Date(`${curr.date}T12:00:00.000Z`),
      });
    }

    console.log(`  ${curr.date}: ${dayDocs} изменений (совпало с БД)`);
    totalMatched += dayMatched;
  }

  console.log(`\n📊 Итого: ${allDocs.length} записей StockLog будет добавлено`);

  if (!EXECUTE) {
    console.log('\n⚠️  DRY RUN — ничего не записано. Добавьте --execute для импорта.');
    await mongoose.disconnect();
    return;
  }

  if (allDocs.length === 0) {
    console.log('Нечего добавлять.');
    await mongoose.disconnect();
    return;
  }

  // Use collection.insertMany to bypass Mongoose auto-timestamps and set createdAt explicitly
  await StockLog.collection.insertMany(allDocs, { ordered: false });
  console.log(`\n✅ Вставлено ${allDocs.length} записей в StockLog`);

  await mongoose.disconnect();
  console.log('✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
