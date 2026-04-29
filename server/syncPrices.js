/**
 * Синхронизация оптовых цен из прайса HOME (29.04.2026)
 * Запуск: node syncPrices.js
 */
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

// ── Прайс-лист HOME (оптовые цены, сом) ────────────────────────────────────
// Ключ — нормализованное имя модели (без цвета, нижний регистр)
const PRICE_MAP = {
  'oturguch':                 2035,
  'archa':                    1100,
  'novel':                     920,
  'enigma':                   1420,
  'fenix':                    2200,
  'infinity':                 1790,
  'kerben':                   2420,
  'eco':                      1090,
  'eco с удлинителем':        1190,
  'sakura':                   1370,   // гладильная доска
  'sakura с удлинителем':     1470,
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
  'keremet':                  2200,   // сушилка 3-этажная
  'avangard':                 1350,
  'comfort':                   930,
  // sakura (сушилка) = тот же ключ 'sakura' — обрабатывается по категории ниже
  'aria':                      365,   // угловая полка / уголок для ванны
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

// Отдельно для сушилки Sakura (та же имя, другая категория)
const SAKURA_DRYER_PRICE  = 1150;
const SAKURA_IRONING_PRICE = 1370;

// Нормализация имени: убрать цвет в скобках, __категория, нижний регистр
function normalize(name = '') {
  return name
    .replace(/\s*\(.*?\)\s*$/, '')   // убрать (белый) / (черный) и т.п.
    .replace(/__.*$/, '')             // убрать __category суффикс
    .trim()
    .toLowerCase();
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB Atlas\n');

  const products = await Product.find({ brand: 'matkasym-home' });
  console.log(`📦 Товаров HOME в БД: ${products.length}\n`);

  // Группируем DB товары по нормализованному имени
  const dbMap = {}; // normalizedName → [product, ...]
  products.forEach(p => {
    const key = normalize(p.name);
    if (!dbMap[key]) dbMap[key] = [];
    dbMap[key].push(p);
  });

  // ── Обновляем цены ──────────────────────────────────────────────────────
  let updated = 0;
  const matched = new Set();

  for (const [key, price] of Object.entries(PRICE_MAP)) {
    const prods = dbMap[key];
    if (!prods || prods.length === 0) continue;
    matched.add(key);

    for (const p of prods) {
      let finalPrice = price;
      // Sakura: разделяем по категории
      if (key === 'sakura') {
        finalPrice = p.category === 'clothes-dryer' ? SAKURA_DRYER_PRICE : SAKURA_IRONING_PRICE;
      }
      await Product.updateOne({ _id: p._id }, { priceWholesale: finalPrice });
      updated++;
    }
  }

  console.log(`✅ Обновлено товаров: ${updated}`);

  // ── В прайсе ЕСТЬ, в БД НЕТ ────────────────────────────────────────────
  const missingInDB = Object.keys(PRICE_MAP).filter(k => !matched.has(k));
  if (missingInDB.length) {
    console.log('\n🔴 В прайсе ЕСТЬ, в Product Matrix НЕТ:');
    missingInDB.forEach(k => console.log(`   - ${k} (оптовая: ${PRICE_MAP[k]} сом)`));
  } else {
    console.log('\n✅ Все товары из прайса найдены в БД');
  }

  // ── В БД ЕСТЬ, в прайсе НЕТ ────────────────────────────────────────────
  const extraInDB = Object.keys(dbMap).filter(k => !PRICE_MAP[k]);
  if (extraInDB.length) {
    console.log('\n🟡 В Product Matrix ЕСТЬ, в прайсе НЕТ (лишние или без цены):');
    extraInDB.forEach(k => {
      const names = [...new Set(dbMap[k].map(p => p.name))].join(', ');
      console.log(`   - ${names}`);
    });
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
