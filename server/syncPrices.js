/**
 * Синхронизация оптовых и розничных цен из прайсов HOME (29.04.2026)
 * Запуск: node syncPrices.js
 */
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

// ── Оптовые цены (сом) ──────────────────────────────────────────────────────
const WHOLESALE_MAP = {
  'oturguch':                 2035,
  'archa':                    1100,
  'novel':                     920,
  'enigma':                   1420,
  'fenix':                    2200,
  'infinity':                 1790,
  'kerben':                   2420,
  'eco':                      1090,
  'eco с удлинителем':        1190,
  'sakura':                   1370,   // гладильная доска (сушилка — ниже)
  'washday':                   600,
  'muras 1':                   980,
  'bosogo 5sw':               1150,
  'bosogo 9sw':               1430,
  'temir ilgich 10s':          590,
  'temir ilgich 5s':           360,
  'lion 3':                   1250,
  'lion 4':                   1700,
  'lion 4 +':                 1950,
  'queen 3':                  1400,
  'queen 4':                  2000,
  'bagym':                    1500,
  'bakcha 3':                 1800,
  'keremet':                  2200,
  'avangard':                 1350,
  'comfort':                   930,
  'aria':                      450,   // 3х полки (в БД только эта версия)
  // Антенны
  'sanarip 10':                370,
  'sanarip 15':                420,
  'sanarip 20':                480,
  'smart':                     370,
  'smart с усилителем':        430,
  'tereze':                    340,
  'compact':                   270,
  // Кронштейны ТВ
  'romi 1':                    100,
  'romi 2':                    140,
  // Мангалы
  'r6':                        700,
  'r8':                        800,
  'r10':                       900,
};

// ── Розничные цены (сом) ────────────────────────────────────────────────────
const RETAIL_MAP = {
  'oturguch':                 2775,
  'archa':                    1700,
  'novel':                    1420,
  'enigma':                   2185,
  'fenix':                    3385,
  'infinity':                 2755,
  'kerben':                   3300,
  'eco':                      1680,
  'eco с удлинителем':        1830,
  'sakura':                   2110,   // гладильная доска (сушилка — ниже)
  'washday':                   925,
  'muras 1':                  1510,
  'bosogo 5sw':               1770,
  'bosogo 9sw':               2200,
  'temir ilgich 10s':          910,
  'temir ilgich 5s':           550,
  'lion 3':                   1925,
  'lion 4':                   2620,
  'lion 4 +':                 3000,
  'queen 3':                  2155,
  'queen 4':                  3080,
  'bagym':                    2310,
  'bakcha 3':                 2400,
  'keremet':                  3385,
  'avangard':                 2080,
  'comfort':                  1430,
  'aria':                      700,   // 3х полки
  // Антенны
  'sanarip 10':                570,
  'sanarip 15':                650,
  'sanarip 20':                740,
  'smart':                     570,
  'smart с усилителем':        665,
  'tereze':                    525,
  'compact':                   420,
  // Кронштейны ТВ
  'romi 1':                    155,
  'romi 2':                    180,
  // Мангалы
  'r6':                       1100,
  'r8':                       1250,
  'r10':                      1400,
};

// Sakura: одно название — два товара (гладильная доска и сушилка)
const SAKURA_WHOLESALE = { ironing: 1370, dryer: 1150 };
const SAKURA_RETAIL    = { ironing: 2110, dryer: 1770 };

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
  const allKeys = new Set([...Object.keys(WHOLESALE_MAP), ...Object.keys(RETAIL_MAP)]);

  for (const key of allKeys) {
    const prods = dbMap[key];
    if (!prods || prods.length === 0) continue;
    matched.add(key);

    for (const p of prods) {
      const update = {};

      if (key === 'sakura') {
        const isDryer = p.category === 'clothes-dryer';
        update.priceWholesale = isDryer ? SAKURA_WHOLESALE.dryer   : SAKURA_WHOLESALE.ironing;
        update.price          = isDryer ? SAKURA_RETAIL.dryer      : SAKURA_RETAIL.ironing;
      } else {
        if (WHOLESALE_MAP[key]) update.priceWholesale = WHOLESALE_MAP[key];
        if (RETAIL_MAP[key])    update.price          = RETAIL_MAP[key];
      }

      await Product.updateOne({ _id: p._id }, update);
      updated++;
    }
  }

  console.log(`✅ Обновлено товаров: ${updated}`);

  const missing = [...allKeys].filter(k => !matched.has(k));
  if (missing.length) {
    console.log('\n🔴 В прайсе ЕСТЬ, в БД НЕТ:');
    missing.forEach(k => console.log(`   - ${k} (опт: ${WHOLESALE_MAP[k] || '?'} / розн: ${RETAIL_MAP[k] || '?'})`));
  } else {
    console.log('✅ Все товары из прайса найдены в БД');
  }

  const extra = Object.keys(dbMap).filter(k => !WHOLESALE_MAP[k] && !RETAIL_MAP[k]);
  if (extra.length) {
    console.log('\n🟡 В БД ЕСТЬ, в прайсе НЕТ (цена не обновлена):');
    extra.forEach(k => {
      const names = [...new Set(dbMap[k].map(p => p.name))].join(', ');
      console.log(`   - ${names}`);
    });
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
