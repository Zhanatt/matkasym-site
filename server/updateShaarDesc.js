/**
 * Обновляет описания и характеристики SHAAR товаров из matkasym_shaar (1).xlsx
 * Запуск: node updateShaarDesc.js
 */
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

// fullName → { description, dimensions, sku, specs[] }
const UPDATES = {
  // ── UZAK KOLDON — Тумбы ──────────────────────────────────────────────────
  'Тумба AICHUROK T 3': {
    sku: 'W010A-3',
    description: 'Тумба с 3 ящиками, чёрные ручки',
    dimensions:  'H1020 x W460 x D600 мм',
    specs: [{ key: 'Кол-во ящиков', value: '3' }, { key: 'Цвет ручек', value: 'чёрный' }],
  },
  'Тумба AICHUROK T 4': {
    sku: 'W010A-4',
    description: 'Тумба с 4 ящиками, чёрные ручки',
    dimensions:  'H1320 x W472 x D600 мм',
    specs: [{ key: 'Кол-во ящиков', value: '4' }, { key: 'Цвет ручек', value: 'чёрный' }],
  },

  // ── UZAK KOLDON — Шкафы ──────────────────────────────────────────────────
  'Шкаф AICHUROK GO 2 (Glass Office)': {
    sku: 'W052',
    description: 'Шкаф двухстворчатый с прозрачными стеклянными дверцами',
    dimensions:  'H1850 x W850 x D400 мм',
    specs: [{ key: 'Кол-во дверей', value: '2' }, { key: 'Материал дверей', value: 'стекло прозрачное' }],
  },
  'Шкаф AICHUROK МO 2 (Metall Office)': {
    sku: 'W060',
    description: 'Шкаф металлический для документов, 5–6 полок',
    dimensions:  'H1850 x W850 x D400 мм',
    specs: [{ key: 'Кол-во полок', value: '5–6' }, { key: 'Назначение', value: 'для документов' }],
  },
  'Шкаф AICHUROK МR 3 (Metall Razdevalka)': {
    sku: 'W001-3',
    description: 'Шкаф-локер односекционный с 3 дверцами',
    dimensions:  'H1850 x W380 x D420 мм',
    specs: [{ key: 'Кол-во секций', value: '3' }],
  },
  'Шкаф AICHUROK МR 4 (Metall Razdevalka)': {
    sku: 'W001-4',
    description: 'Шкаф-локер односекционный с 4 дверцами',
    dimensions:  'H1850 x W380 x D420 мм',
    specs: [{ key: 'Кол-во секций', value: '4' }],
  },
  'Шкаф AICHUROK МR 6 (Metall Razdevalka)': {
    sku: 'W078',
    description: 'Шкаф шестидверный для одежды',
    dimensions:  'H1850 x W900 x D420 мм',
    specs: [{ key: 'Кол-во дверей', value: '6' }, { key: 'Назначение', value: 'для одежды' }],
  },

  // ── BILIM KELECHEK — Парты ────────────────────────────────────────────────
  'Школьная парта S2 (стандартная)': {
    description: 'Комплект: стол 1200x450 мм, высота 660 мм (1 шт) + 2 стула grey',
    dimensions:  '1200 x 450 мм, высота 660 мм',
    specs: [{ key: 'Размер стола', value: '1200x450 мм' }, { key: 'Высота', value: '660 мм' }, { key: 'Стулья', value: '2 шт, grey' }],
  },
  'Школьная парта S2R (стандарт регулируемый)': {
    description: 'Комплект: стол 1200x450 мм, высота 760 мм (1 шт) + 2 стула grey',
    dimensions:  '1200 x 450 мм, высота 760 мм',
    specs: [{ key: 'Размер стола', value: '1200x450 мм' }, { key: 'Высота', value: '760 мм' }, { key: 'Стулья', value: '2 шт, grey' }, { key: 'Регулировка', value: 'да' }],
  },
  'Школьная парта S1': {
    description: 'Комплект: стол + стул на одного человека',
    specs: [{ key: 'Комплектация', value: 'стол + 1 стул' }],
  },

  // ── BILIM KELECHEK — Интерактивные столы ─────────────────────────────────
  'Интерактивный стол I 2': {
    description: 'Стол прямоугольный на колёсах, модель D27',
    specs: [{ key: 'Модель', value: 'D27' }, { key: 'Колёса', value: 'да' }],
  },
  'Электрорегулируемый стол E 2 R': {
    description: 'Стол регулируемый электрический sit-stand, модель 2201',
    specs: [{ key: 'Модель', value: '2201' }, { key: 'Регулировка', value: 'электрическая (sit-stand)' }],
  },
  'Групповые столы G 6 (комплект 6 столов)': {
    description: 'Комплект: 6 столов D27 + 6 стульев F9',
    specs: [{ key: 'Столы', value: '6 шт, модель D27' }, { key: 'Стулья', value: '6 шт, модель F9' }],
  },
};

// стол I 1 R — 3 отдельных варианта
const I1R_MODELS = [
  { name: 'Стол I 1 R Модель 01', fullName: 'Интерактивный стол I 1 R Модель 01', description: 'Стол подъёмный (кафедра) модель 01', specs: [{ key: 'Модель', value: '01' }, { key: 'Конструкция', value: 'подъёмный (кафедра)' }] },
  { name: 'Стол I 1 R Модель 02', fullName: 'Интерактивный стол I 1 R Модель 02', description: 'Стол подъёмный (кафедра) модель 02', specs: [{ key: 'Модель', value: '02' }, { key: 'Конструкция', value: 'подъёмный (кафедра)' }] },
  { name: 'Стол I 1 R Модель 03', fullName: 'Интерактивный стол I 1 R Модель 03', description: 'Стол подъёмный (кафедра) модель 03', specs: [{ key: 'Модель', value: '03' }, { key: 'Конструкция', value: 'подъёмный (кафедра)' }] },
];

// Стул F9 — отдельный товар (был без имени в Excel)
const STUL_F9 = {
  brand: 'matkasym-shaar',
  set: 'bilim-kelechek',
  category: 'school-desk',
  name: 'Стул F9',
  fullName: 'Стул ученический пластиковый F9',
  description: 'Стул ученический пластиковый на металлических ножках, модель F9',
  specs: [{ key: 'Модель', value: 'F9' }, { key: 'Материал', value: 'пластик + металл' }],
  price: 0, priceWholesale: 0, priceDealer: 0, priceCost: 0,
  inStock: false, stock: 0, stockStatus: 'out_of_stock', productStatus: 'planned',
  isNew: false, rating: 0, reviewCount: 0,
};

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB Atlas\n');

  let updatedCount = 0;

  // 1. Обновляем товары по fullName
  for (const [fullName, data] of Object.entries(UPDATES)) {
    const res = await Product.updateOne(
      { brand: 'matkasym-shaar', fullName },
      { $set: data }
    );
    if (res.matchedCount) {
      console.log(`✅ ${fullName}`);
      updatedCount++;
    } else {
      console.log(`🔴 НЕ НАЙДЕН: ${fullName}`);
    }
  }

  // 2. Удаляем старый единственный "Стол I 1 R" и добавляем 3 варианта
  const delOld = await Product.deleteMany({ brand: 'matkasym-shaar', name: 'Стол I 1 R' });
  console.log(`\n🗑  Удалено старых "Стол I 1 R": ${delOld.deletedCount}`);

  const BASE = { brand: 'matkasym-shaar', set: 'bilim-kelechek', category: 'school-desk',
    price: 0, priceWholesale: 0, priceDealer: 0, priceCost: 0,
    inStock: false, stock: 0, stockStatus: 'out_of_stock', productStatus: 'planned',
    isNew: false, rating: 0, reviewCount: 0 };

  await Product.insertMany(I1R_MODELS.map(m => ({ ...BASE, ...m })));
  console.log(`✅ Добавлено вариантов Стол I 1 R: ${I1R_MODELS.length}`);

  // 3. Добавляем Стул F9 (если ещё нет)
  const existsF9 = await Product.findOne({ brand: 'matkasym-shaar', name: 'Стул F9' });
  if (!existsF9) {
    await Product.create(STUL_F9);
    console.log('✅ Добавлен: Стул F9');
  } else {
    console.log('ℹ️  Стул F9 уже существует, пропускаем');
  }

  console.log(`\n✅ Итого обновлено: ${updatedCount} товаров`);
  await mongoose.disconnect();
  console.log('✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
