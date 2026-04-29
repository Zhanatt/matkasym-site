/**
 * Синхронизация розничных цен из прайса HOME (29.04.2026)
 * Запуск: node syncRetailPrices.js
 */
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

const PRICE_MAP = {
  'oturguch':              2775,
  'archa':                 1700,
  'novel':                 1420,
  'enigma':                2185,
  'fenix':                 3385,
  'infinity':              2755,
  'kerben':                3300,
  'eco':                   1680,
  'eco с удлинителем':     1830,
  'sakura':                2110,   // гладильная доска
  'sakura с удлинителем':  2260,
  'washday':                925,
  'muras 1':               1510,
  'bosogo 5sw':            1770,
  'bosogo 9sw':            2200,
  'temir ilgich 10s':       910,
  'temir ilgich 5s':        550,
  'lion 3':                1925,
  'lion 4':                2620,
  'lion 4 +':              3000,
  'queen 3':               2155,
  'queen 4':               3080,
  'bagym':                 2310,
  'bakcha 3':              2400,
  'keremet':               3385,
  'avangard':              2080,
  'comfort':               1430,
  'aria':                   500,
  // Антенны
  'sanarip 10':             570,
  'sanarip 15':             650,
  'sanarip 20':             740,
  'smart':                  570,
  'smart с усилителем':     665,
  'tereze':                 525,
  'compact':                420,
  // Кронштейны ТВ
  'romi 1':                 155,
  'romi 2':                 180,
  // Мангалы
  'r6':                    1100,
  'r8':                    1250,
  'r10':                   1400,
};

const SAKURA_DRYER_PRICE   = 1770;
const SAKURA_IRONING_PRICE = 2110;

function normalize(name = '') {
  return name
    .replace(/\s*\(.*?\)\s*$/, '')
    .replace(/__.*$/, '')
    .trim()
    .toLowerCase();
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB Atlas\n');

  const products = await Product.find({ brand: 'matkasym-home' });
  console.log(`📦 Товаров HOME в БД: ${products.length}\n`);

  const dbMap = {};
  products.forEach(p => {
    const key = normalize(p.name);
    if (!dbMap[key]) dbMap[key] = [];
    dbMap[key].push(p);
  });

  let updated = 0;
  const matched = new Set();

  for (const [key, price] of Object.entries(PRICE_MAP)) {
    const prods = dbMap[key];
    if (!prods || prods.length === 0) continue;
    matched.add(key);

    for (const p of prods) {
      let finalPrice = price;
      if (key === 'sakura') {
        finalPrice = p.category === 'clothes-dryer' ? SAKURA_DRYER_PRICE : SAKURA_IRONING_PRICE;
      }
      await Product.updateOne({ _id: p._id }, { price: finalPrice });
      updated++;
    }
  }

  console.log(`✅ Обновлено товаров: ${updated}`);

  const missingInDB = Object.keys(PRICE_MAP).filter(k => !matched.has(k));
  if (missingInDB.length) {
    console.log('\n🔴 В прайсе ЕСТЬ, в Product Matrix НЕТ:');
    missingInDB.forEach(k => console.log(`   - ${k} (розничная: ${PRICE_MAP[k]} сом)`));
  }

  const extraInDB = Object.keys(dbMap).filter(k => !PRICE_MAP[k]);
  if (extraInDB.length) {
    console.log('\n🟡 В Product Matrix ЕСТЬ, в прайсе НЕТ:');
    extraInDB.forEach(k => {
      const names = [...new Set(dbMap[k].map(p => p.name))].join(', ');
      console.log(`   - ${names}`);
    });
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
