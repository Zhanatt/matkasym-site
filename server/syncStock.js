/**
 * Синхронизация остатков из XLS (Остатки товаров)
 * Коммерческий склад + Основной склад → поле stock в БД
 * Запуск: node syncStock.js
 */
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

// ── Остатки из XLS (коммерческий + основной склад) ─────────────────────────
// Ключ — нормализованное имя (без цвета, нижний регистр), как в syncPrices.js
// Значение: итого по всем цветовым вариантам вместе (для отображения по модели)
// Если у модели разные цвета — ставим суммарный остаток, фронтенд делит по вариантам
const STOCK_MAP = {
  // ── Кронштейны ──────────────────────────────────────────────────
  'romi 1':                2794,  // 14-42: 10 + 15-47: 2784
  'romi 2':                3815,

  // ── Антенны ─────────────────────────────────────────────────────
  'sanarip 10':             523,
  'sanarip 15':              15,
  'sanarip 20':              14,
  'smart':                    3,
  'smart с усилителем':     107,
  'tereze':                  77,
  'compact':                 30,

  // ── Мангалы ─────────────────────────────────────────────────────
  'r6':                     165,
  'r8':                      12,
  'r10':                      0,

  // ── Обувные полки / вешалки (KOSH-KELINIZ) ───────────────────────
  'oturguch':                 4,
  'archa':                   12,
  'novel':                   30,  // белый 21 + черный 9
  'bosogo 5sw':              30,  // белая 2 + черная 28
  'bosogo 9sw':              76,
  'temir ilgich 5s':         57,
  'lion 3':                   9,  // белый 6 + черный 3
  'lion 4':                  15,  // черный 15
  'lion 4 +':                 1,
  'queen 3':                  4,  // белая 1 + черная 3
  'queen 4':                  4,  // белая 1 + черная 3

  // ── Вешалки гардеробные (TAZA-KIYIM) ────────────────────────────
  'enigma':                 133,
  'fenix':                   14,  // белый 8 + черный 6
  'infinity':                36,  // белый 20 + черный 16
  'kerben':                  19,  // белый 13 + черный 6
  'muras 1':                  6,  // белая 3 + черная 3

  // ── Гладильные доски ─────────────────────────────────────────────
  'eco':                     82,
  'eco с удлинителем':      101,  // белая 99 + черная 2

  // ── Корзины для белья ────────────────────────────────────────────
  'washday':                 78,

  // ── Сушилки ──────────────────────────────────────────────────────
  'keremet':                  3,
  'avangard':                19,
  'comfort':               1157,  // черная 669 + серая 488

  // ── Полки для цветов (GREEN-OMIR) ───────────────────────────────
  'bagym':                    3,
  'bakcha 3':                 3,

  // ── Угловые полки (DEN-SOOLUK) ──────────────────────────────────
  'aria':                    71,  // 2х+крючок 49 + 3х 0 + 3х+крючок 22

  // ── Sakura (гладильная доска и сушилка — обрабатывается отдельно) ──
  'sakura':                   0,  // placeholder, заменяется по категории ниже
};

// Для Sakura: гладильная доска и сушилка — разные остатки
const SAKURA_IRONING = 12;
const SAKURA_DRYER   = 902;   // 418 + розовая 484

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
  console.log(`📦 Товаров HOME: ${products.length}\n`);

  const dbMap = {};
  products.forEach(p => {
    const key = normalize(p.name);
    if (!dbMap[key]) dbMap[key] = [];
    dbMap[key].push(p);
  });

  let updated = 0;
  const matched = new Set();

  for (const [key, stock] of Object.entries(STOCK_MAP)) {
    const prods = dbMap[key];
    if (!prods || prods.length === 0) continue;
    matched.add(key);

    for (const p of prods) {
      let finalStock = stock;
      if (key === 'sakura') {
        finalStock = p.category === 'clothes-dryer' ? SAKURA_DRYER : SAKURA_IRONING;
      }
      await Product.updateOne({ _id: p._id }, { stock: finalStock });
      updated++;
    }
  }

  console.log(`✅ Обновлено товаров: ${updated}`);

  const missing = Object.keys(STOCK_MAP).filter(k => !matched.has(k));
  if (missing.length) {
    console.log('\n🔴 В XLS есть, в БД нет:');
    missing.forEach(k => console.log(`   - ${k} (остаток: ${STOCK_MAP[k]})`));
  }

  const extra = Object.keys(dbMap).filter(k => !STOCK_MAP[k] && k !== 'sakura');
  if (extra.length) {
    console.log('\n🟡 В БД есть, в XLS нет (остаток не обновлён):');
    extra.forEach(k => {
      const names = [...new Set(dbMap[k].map(p => p.name))].join(', ');
      console.log(`   - ${names}`);
    });
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
