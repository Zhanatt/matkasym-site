require('dotenv').config();
const mongoose = require('mongoose');
const Product  = require('./models/Product');
const fs       = require('fs');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

function norm(s) {
  return (s || '').toLowerCase().replace(/[«»"""''`]/g, '').replace(/\s+/g, ' ').trim();
}

// Ручной маппинг: norm(fullName в БД) → norm(название в XLS)
const MANUAL = {
  // Офисные урны
  'офисная урна 20 л 2х камерная (cross)': 'мусорная урна сортировочная 2х секционная  20 л (пластик)',
  'офисная урна 40 л 2х камерная (cross)': 'мусорная урна сортировочная 2х секционная  40 л (пластик)',

  // Эко контейнеры
  'эко контейнер eco mayak': 'мусорная урна ecomayak (зеленая)',

  // Электрощиты наружные (ЩР)
  'щит распределительный наружный щр ip31 30х22х12': 'электрощит 30*22*12',
  'щит распределительный наружный щр ip31 30х30х15': 'электрощит 30*30*15',
  'щит распределительный наружный щр ip31 35х35х15': 'электрощит 35*35*15',
  'щит распределительный наружный щр ip31 40х30х15': 'электрощит 40*30*15',
  'щит распределительный наружный щр ip31 40х40х15': 'электрощит 40х40х15',
  'щит распределительный наружный щр ip31 43х43х15': 'электрощит 43*43*15',
  'щит распределительный наружный щр ip31 50х30х15': 'электрощит 50*30*15',
  'щит распределительный наружный щр ip31 50х40х15': 'электрощит 50*40*15',
  'щит распределительный наружный щр ip31 50х40х20': 'электрощит 50х40х20',
  'щит распределительный наружный щр ip31 60х40х15': 'электрощит 60*40*15',
  'щит распределительный наружный щр ip31 60х40х20': 'электрощит 60х40х20',
  'щит распределительный наружный щр ip31 65х50х20': 'электрощит 65*50*20',
  'щит распределительный наружный щр ip31 80х60х20': 'электрощит 80*60*20',

  // Щит с монтажной панелью (ЩМП)
  'щит с монтажной панелью щмп ip31 50х40х20': 'электрощит 50х40х20 с фальшпанелью',
  'щит с монтажной панелью щмп ip31 60х40х20': 'электрощит 60х40х20 с фальшпанелью',

  // Щит газовый (ЩГР)
  'щит газовый регулирующий щгр вертикальный':   'щит газовый вертикальный',

  // Кронштейн для кондиционера
  'кронштейн для кондиционера mini 9':   'кронштейн для кондиционера mini 7-9',
  'кронштейн для кондиционера melis pro': 'кронштейн для кондиционера middle 12 (белый 1.8)',

  // Шкафы Aichurok
  'шкаф aichurok go 2 (glass office)':         'шкаф  aichurok go2 (w052 h1850*w850*d400)',
  'шкаф aichurok мo 2 (metall office)':        'шкаф  aichurok mo2 для документов (w060h1850*w850*d400 (5 полок))',
  'шкаф aichurok мr 3 (metall razdevalka)':    'шкаф  aichurok mr3 дверцами (w001-3 h1850*w380*d420)',
  'шкаф aichurok мr 4 (metall razdevalka)':    'шкаф aichurok mr4 дверцами (w001-4 h1850*w380*d420)',

  // Интерактивные столы
  'интерактивный стол i 1 r модель 01': 'стол i 1 r модель - 01',
  'интерактивный стол i 1 r модель 02': 'стол i 1 r модель - 01', // нет 02 в XLS — ставим 01
  'интерактивный стол i 1 r модель 03': 'стол i 1 r модель - 03',

  // Школьные парты
  'школьная парта s2 (стандартная)':         'стол стандарт s2-х 1100х450',
  'школьная парта s2r (стандарт регулируемый)': 'стол стандарт s2-х 1100х450',
};

async function main() {
  const stockData = JSON.parse(fs.readFileSync('/tmp/shaar_stock.json', 'utf8'));

  const stockMap = new Map();
  for (const row of stockData) {
    stockMap.set(norm(row.name), row.stock);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB\n');

  const products = await Product.find({ brand: 'matkasym-shaar' });
  console.log(`📦 Товаров SHAAR: ${products.length}`);

  let updated = 0, notFound = [];

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
        if (key.length > 5 && (key.includes(normName) || normName.includes(key))) {
          stock = val; break;
        }
      }
    }

    if (stock !== null) {
      const realStock = Math.max(0, stock);
      await Product.updateOne(
        { _id: p._id },
        { $set: { stock: realStock, inStock: realStock > 0, stockStatus: realStock > 0 ? 'in_stock' : 'out_of_stock' } }
      );
      updated++;
      console.log(`  ✅ ${p.fullName || p.name} → ${realStock}${stock < 0 ? ` (было ${stock})` : ''}`);
    } else {
      notFound.push(p.fullName || p.name);
    }
  }

  console.log(`\n✅ Обновлено: ${updated}/${products.length}`);
  if (notFound.length) {
    console.log(`\n⚠️  Не найдено в XLS (${notFound.length}):`);
    notFound.forEach(n => console.log(`   • ${n}`));
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
