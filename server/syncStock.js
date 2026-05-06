const mongoose = require('mongoose');
const Product  = require('./models/Product');
const XLSX     = require('xlsx');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к БД');

  // Parse Excel
  const wb = XLSX.readFile('/Users/zhanat/Downloads/остатки склад(05052026)-3.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Col 4 = Основной склад "Остаток", Col 19 = Коммерческий склад "Остаток"
  const excelMap = new Map();
  for (let i = 7; i < data.length; i++) {
    const row = data[i];
    const name = (row[0] || '').trim();
    if (!name) continue;
    const osn  = Number(row[4]) || 0;
    const komm = Number(row[19]) || 0;
    excelMap.set(name, { osn, komm, total: Math.max(0, osn + komm) });
  }

  // Get all DB products
  const dbProducts = await Product.find({ brand: 'matkasym-home' }).select('name stock inStock').lean();
  console.log(`БД товаров: ${dbProducts.length}, Excel строк: ${excelMap.size}`);

  let updated = 0;
  let notFound = [];

  for (const p of dbProducts) {
    let newStock = null;

    // 1. Exact match
    if (excelMap.has(p.name)) {
      newStock = excelMap.get(p.name).total;
    } else {
      // 2. Prefix match — sum all Excel rows starting with DB product name
      let sum = 0;
      let found = false;
      for (const [eName, eData] of excelMap) {
        if (eName.startsWith(p.name + ' ') || eName.startsWith(p.name + '(')) {
          sum += eData.total;
          found = true;
        }
      }
      if (found) {
        newStock = Math.max(0, sum);
      }
    }

    if (newStock !== null) {
      const inStock = newStock > 0;
      await Product.updateOne(
        { _id: p._id },
        { $set: { stock: newStock, inStock } }
      );
      updated++;
    } else {
      notFound.push(p.name);
    }
  }

  console.log(`\n✅ Обновлено: ${updated} товаров`);
  if (notFound.length > 0) {
    const unique = [...new Set(notFound)].sort((a, b) => a.localeCompare(b, 'ru'));
    console.log(`\n⚠️ Не найдено в Excel (${unique.length}):`);
    unique.forEach(n => console.log('  -', n));
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
