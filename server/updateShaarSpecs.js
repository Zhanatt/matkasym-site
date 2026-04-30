/**
 * Обновляет характеристики, габариты (формат ДхШхВ) и цены SHAAR товаров
 * Источники: каталог 0-tashtandy(ru).pdf, паспорт TL_Urna_Sortirovki, Excel
 * Запуск: node updateShaarSpecs.js
 */
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

// ── По name (поиск по brand + name) ──────────────────────────────────────────
const BY_NAME = {

  // ══════════════════════════════════════════════════════════════════════════
  // 0-TASHTANDY — ЭКО УРНЫ (из каталога 0-tashtandy(ru).pdf)
  // ══════════════════════════════════════════════════════════════════════════

  'G Tegerek': {
    dimensions: '24 х 24 х 58 см',
    price: 2600,
    description: 'Компактная уличная эко урна серии G (graund). Уличная напольная урна.',
    specs: [
      { key: 'Материал', value: 'Металл' },
      { key: 'Тип', value: 'Уличная напольная' },
      { key: 'Серия', value: 'G graund' },
    ],
  },

  'G2': {
    dimensions: '35 х 115 х 84 см',
    description: 'Уличная эко урна серии G (graund). Вместительная многосекционная конструкция.',
    specs: [
      { key: 'Материал', value: 'Металл' },
      { key: 'Тип', value: 'Уличная напольная' },
      { key: 'Серия', value: 'G graund' },
    ],
  },

  'G3': {
    dimensions: '35 х 115 х 84 см',
    description: 'Уличная эко урна серии G (graund). Вместительная многосекционная конструкция.',
    specs: [
      { key: 'Материал', value: 'Металл' },
      { key: 'Тип', value: 'Уличная напольная' },
      { key: 'Серия', value: 'G graund' },
    ],
  },

  'G4': {
    dimensions: '35 х 115 х 84 см',
    price: 18000,
    description: 'Уличная эко урна серии G (graund). Вместительная многосекционная конструкция.',
    specs: [
      { key: 'Материал', value: 'Металл' },
      { key: 'Тип', value: 'Уличная напольная' },
      { key: 'Серия', value: 'G graund' },
    ],
  },

  'GW': {
    dimensions: '38 х 38 х 83 см',
    price: 5000,
    description: 'Уличная эко урна GW (graund wood) — металлический корпус с деревянным декором.',
    specs: [
      { key: 'Материал', value: 'Металл + дерево' },
      { key: 'Тип', value: 'Уличная напольная' },
      { key: 'Серия', value: 'GW graund wood' },
    ],
  },

  'GW2': {
    dimensions: '38 х 38 х 83 см',
    description: 'Уличная эко урна GW2 (graund wood) — металлический корпус с деревянным декором.',
    specs: [
      { key: 'Материал', value: 'Металл + дерево' },
      { key: 'Тип', value: 'Уличная напольная' },
      { key: 'Серия', value: 'GW graund wood' },
    ],
  },

  'GW3': {
    dimensions: '38 х 38 х 83 см',
    description: 'Уличная эко урна GW3 (graund wood) — металлический корпус с деревянным декором.',
    specs: [
      { key: 'Материал', value: 'Металл + дерево' },
      { key: 'Тип', value: 'Уличная напольная' },
      { key: 'Серия', value: 'GW graund wood' },
    ],
  },

  // GWR (WR) — 3-секционные сортирующие урны (паспорт TL_Urna_Sortirovki)
  'GWR': {
    dimensions: '35 х 115 х 104 см',
    price: 25000,
    description: 'Уличная эко урна для раздельного сбора отходов GWR. 3 секции для разных видов отходов.',
    specs: [
      { key: 'Материал', value: 'Листовая сталь 1.0 мм (CRCA)' },
      { key: 'Покрытие', value: 'Порошковое, RAL 7035 (светло-серый)' },
      { key: 'Кол-во секций', value: '3' },
      { key: 'Внутренние баки', value: '3 шт., съёмные, полимерные' },
      { key: 'Тип крышки', value: 'Единая, петлевой механизм' },
      { key: 'Тип', value: 'Уличная напольная' },
    ],
  },

  'GWR2': {
    dimensions: '35 х 115 х 104 см',
    description: 'Уличная эко урна для раздельного сбора отходов GWR2. 3 секции.',
    specs: [
      { key: 'Материал', value: 'Листовая сталь 1.0 мм (CRCA)' },
      { key: 'Покрытие', value: 'Порошковое, RAL 7035 (светло-серый)' },
      { key: 'Кол-во секций', value: '3' },
      { key: 'Тип', value: 'Уличная напольная' },
    ],
  },

  'GWR3': {
    dimensions: '35 х 115 х 104 см',
    description: 'Уличная эко урна для раздельного сбора отходов GWR3. 3 секции.',
    specs: [
      { key: 'Материал', value: 'Листовая сталь 1.0 мм (CRCA)' },
      { key: 'Покрытие', value: 'Порошковое, RAL 7035 (светло-серый)' },
      { key: 'Кол-во секций', value: '3' },
      { key: 'Тип', value: 'Уличная напольная' },
    ],
  },

  // A / AW (asma) — подвесные эко урны
  'A': {
    dimensions: '13 х 39 х 96 см',
    price: 9000,
    description: 'Эко урна A (asma) — подвесная металлическая урна.',
    specs: [
      { key: 'Материал', value: 'Металл' },
      { key: 'Тип', value: 'Подвесная' },
      { key: 'Серия', value: 'asma' },
    ],
  },

  'AW': {
    dimensions: '36 х 46 х 86 см',
    price: 9000,
    description: 'Эко урна AW (asma wood) — подвесная урна с деревянным декором.',
    specs: [
      { key: 'Материал', value: 'Металл + дерево' },
      { key: 'Тип', value: 'Подвесная' },
      { key: 'Серия', value: 'asma wood' },
    ],
  },

  // SW (square wood) — квадратные деревянные урны
  'SW': {
    dimensions: '75 х 41 х 73 см',
    price: 12500,
    description: 'Эко урна SW (square wood) — уличная урна с деревянным корпусом квадратной формы.',
    specs: [
      { key: 'Материал', value: 'Металл + дерево' },
      { key: 'Тип', value: 'Уличная напольная' },
      { key: 'Серия', value: 'square wood' },
    ],
  },

  'SW2': {
    dimensions: '75 х 41 х 73 см',
    description: 'Эко урна SW2 (square wood) — уличная урна с деревянным корпусом.',
    specs: [
      { key: 'Материал', value: 'Металл + дерево' },
      { key: 'Тип', value: 'Уличная напольная' },
      { key: 'Серия', value: 'square wood' },
    ],
  },

  'SW3': {
    dimensions: '75 х 41 х 73 см',
    description: 'Эко урна SW3 (square wood) — уличная урна с деревянным корпусом.',
    specs: [
      { key: 'Материал', value: 'Металл + дерево' },
      { key: 'Тип', value: 'Уличная напольная' },
      { key: 'Серия', value: 'square wood' },
    ],
  },

  // KARAKOL серия
  'BP': {
    description: 'Эко урна BP (bishkek petroleum) — уличная урна серии KARAKOL.',
    specs: [{ key: 'Серия', value: 'KARAKOL / bishkek petroleum' }, { key: 'Тип', value: 'Уличная' }],
  },

  'BP Pro': {
    description: 'Эко урна BP Pro (bishkek petroleum) — улучшенная версия серии KARAKOL.',
    specs: [{ key: 'Серия', value: 'KARAKOL / bishkek petroleum' }, { key: 'Тип', value: 'Уличная' }],
  },

  'Karakol 2': {
    dimensions: '105 х 30 х 89 см',
    description: 'Эко урна Karakol 2 — уличная урна серии KARAKOL.',
    specs: [{ key: 'Серия', value: 'KARAKOL' }, { key: 'Тип', value: 'Уличная' }],
  },

  'Karakol 3': {
    dimensions: '105 х 30 х 89 см',
    description: 'Эко урна Karakol 3 — уличная урна серии KARAKOL.',
    specs: [{ key: 'Серия', value: 'KARAKOL' }, { key: 'Тип', value: 'Уличная' }],
  },

  'Karakol 4': {
    dimensions: '105 х 30 х 89 см',
    price: 25000,
    description: 'Эко урна Karakol 4 — уличная урна серии KARAKOL.',
    specs: [{ key: 'Серия', value: 'KARAKOL' }, { key: 'Тип', value: 'Уличная' }],
  },

  'Novotel 3': {
    dimensions: '30 х 30 х 62 см',
    price: 18000,
    description: 'Эко урна Novotel 3 — компактная уличная урна.',
    specs: [{ key: 'Тип', value: 'Уличная напольная' }],
  },

  'Plaza': {
    description: 'Эко урна Plaza — уличная урна серии KARAKOL.',
    specs: [{ key: 'Серия', value: 'KARAKOL' }, { key: 'Тип', value: 'Уличная' }],
  },

  // Контейнеры Tazalyk
  'Tazalyk 1100 L': {
    dimensions: '110 х 97 х 126 см',
    price: 25500,
    description: 'Металлический контейнер для отходов Tazalyk 1100 л.',
    specs: [
      { key: 'Объём', value: '1100 л' },
      { key: 'Материал', value: 'Металл' },
      { key: 'Тип', value: 'Уличный контейнер' },
    ],
  },

  'Tazalyk 660 L': {
    description: 'Металлический контейнер для отходов Tazalyk 660 л.',
    specs: [{ key: 'Объём', value: '660 л' }, { key: 'Материал', value: 'Металл' }],
  },

  'Tazalyk R 1100 L': {
    description: 'Металлический контейнер Tazalyk R 1100 л (с колёсами).',
    specs: [{ key: 'Объём', value: '1100 л' }, { key: 'Колёса', value: 'да' }, { key: 'Материал', value: 'Металл' }],
  },

  // Пластиковые контейнеры
  '1100 литров': {
    specs: [{ key: 'Объём', value: '1100 л' }, { key: 'Материал', value: 'Пластик' }],
  },
  '660 литров': {
    specs: [{ key: 'Объём', value: '660 л' }, { key: 'Материал', value: 'Пластик' }],
  },
  '330 литров': {
    specs: [{ key: 'Объём', value: '330 л' }, { key: 'Материал', value: 'Пластик' }],
  },
  '240 литров с педалью': {
    specs: [{ key: 'Объём', value: '240 л' }, { key: 'Педаль', value: 'да' }, { key: 'Материал', value: 'Пластик' }],
  },
  '120 литров с педалью': {
    specs: [{ key: 'Объём', value: '120 л' }, { key: 'Педаль', value: 'да' }, { key: 'Материал', value: 'Пластик' }],
  },
  '240 литров': {
    specs: [{ key: 'Объём', value: '240 л' }, { key: 'Материал', value: 'Пластик' }],
  },
  '120 литров': {
    specs: [{ key: 'Объём', value: '120 л' }, { key: 'Материал', value: 'Пластик' }],
  },
  '80 литров': {
    specs: [{ key: 'Объём', value: '80 л' }, { key: 'Материал', value: 'Пластик' }],
  },
  '50 литров': {
    specs: [{ key: 'Объём', value: '50 л' }, { key: 'Материал', value: 'Пластик' }],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // UZAK KOLDON — Тумбы и шкафы (исправление D→Д, H→В, W→Ш)
  // ══════════════════════════════════════════════════════════════════════════

  'Aichurok T 3': {
    dimensions: '600 х 460 х 1020 мм',  // D600 x W460 x H1020
    sku: 'W010A-3',
    description: 'Тумба с 3 ящиками, чёрные ручки',
    specs: [{ key: 'Кол-во ящиков', value: '3' }, { key: 'Цвет ручек', value: 'чёрный' }],
  },

  'Aichurok T 4': {
    dimensions: '600 х 472 х 1320 мм',  // D600 x W472 x H1320
    sku: 'W010A-4',
    description: 'Тумба с 4 ящиками, чёрные ручки',
    specs: [{ key: 'Кол-во ящиков', value: '4' }, { key: 'Цвет ручек', value: 'чёрный' }],
  },

  'Aichurok GO 2': {
    dimensions: '400 х 850 х 1850 мм',  // D400 x W850 x H1850
    sku: 'W052',
    description: 'Шкаф двухстворчатый с прозрачными стеклянными дверцами',
    specs: [{ key: 'Кол-во дверей', value: '2' }, { key: 'Материал дверей', value: 'стекло прозрачное' }],
  },

  'Aichurok MO 2': {
    dimensions: '400 х 850 х 1850 мм',  // D400 x W850 x H1850
    sku: 'W060',
    description: 'Металлический шкаф для документов, 5–6 полок',
    specs: [{ key: 'Кол-во полок', value: '5–6' }, { key: 'Назначение', value: 'для документов' }],
  },

  'Aichurok MR 3': {
    dimensions: '420 х 380 х 1850 мм',  // D420 x W380 x H1850
    sku: 'W001-3',
    description: 'Шкаф-локер односекционный с 3 дверцами',
    specs: [{ key: 'Кол-во секций', value: '3' }],
  },

  'Aichurok MR 4': {
    dimensions: '420 х 380 х 1850 мм',  // D420 x W380 x H1850
    sku: 'W001-4',
    description: 'Шкаф-локер односекционный с 4 дверцами',
    specs: [{ key: 'Кол-во секций', value: '4' }],
  },

  'Aichurok MR 6': {
    dimensions: '420 х 900 х 1850 мм',  // D420 x W900 x H1850
    sku: 'W078',
    description: 'Шкаф шестидверный для одежды',
    specs: [{ key: 'Кол-во дверей', value: '6' }, { key: 'Назначение', value: 'для одежды' }],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BILIM KELECHEK — Парты (из Excel-описаний + исправление габаритов)
  // ══════════════════════════════════════════════════════════════════════════

  'Парта S2': {
    dimensions: '1200 х 450 х 660 мм',
    description: 'Комплект: стол 1200×450 мм, высота 660 мм (1 шт) + 2 стула grey',
    specs: [
      { key: 'Стол', value: '1200×450 мм' },
      { key: 'Высота стола', value: '660 мм' },
      { key: 'Стулья', value: '2 шт, grey' },
    ],
  },

  'Парта S2R': {
    dimensions: '1200 х 450 х 760 мм',
    description: 'Комплект: стол 1200×450 мм, высота 760 мм (1 шт) + 2 стула grey. Регулируемая высота.',
    specs: [
      { key: 'Стол', value: '1200×450 мм' },
      { key: 'Высота стола', value: '760 мм' },
      { key: 'Стулья', value: '2 шт, grey' },
      { key: 'Регулировка', value: 'да' },
    ],
  },
};

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB Atlas\n');

  let updated = 0;
  let notFound = [];

  for (const [name, data] of Object.entries(BY_NAME)) {
    const res = await Product.updateOne(
      { brand: 'matkasym-shaar', name },
      { $set: data }
    );
    if (res.matchedCount) {
      console.log(`✅ ${name}`);
      updated++;
    } else {
      console.log(`🔴 не найден: ${name}`);
      notFound.push(name);
    }
  }

  console.log(`\n✅ Обновлено: ${updated}`);
  if (notFound.length) {
    console.log(`🔴 Не найдено: ${notFound.join(', ')}`);
  }

  await mongoose.disconnect();
  console.log('✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
