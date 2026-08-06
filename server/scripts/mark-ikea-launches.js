// Разовая разметка источника у карточек тестовой продажи.
//
// Поле ProductLaunch.supplier появилось позже самих карточек, поэтому у старых
// тестов источник пуст. Проставляем его двумя способами:
//   1. товар уже заведён в каталоге → берём supplier.company оттуда;
//   2. каталожной карточки нет → смотрим на название: заявки от менеджеров
//      приходят с названиями моделей IKEA (ТАГГАДЖ, СКУББ, VESKEN…).
//
// Запуск:  node scripts/mark-ikea-launches.js [--apply]
// Без --apply только показывает, что изменится.

const mongoose = require('mongoose');
const ProductLaunch = require('../models/ProductLaunch');
const Product = require('../models/Product');

const MONGO_URI = process.env.MONGO_URI
  || 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym';

// Названия моделей IKEA из заявок менеджеров — то, что нельзя вычислить из данных.
const IKEA_NAMES = [
  'ТАГГАДЖ', 'АННОНЫ', 'СКУББ', 'ЛЕННАРТ', 'ВАРИЕРА', 'НОЛБЛЕККА', 'ТЕВАЛЕН',
  'НИССАПОР', 'ЛОТСФОГЕЛЬ', 'PASKOTRAD', 'VESKEN',
];
// Карточки, где название модели потерялось, а товар опознан по фото
// (№63 — тот же бамбуковый органайзер IKEA, что и №61, только двухъярусный).
const IKEA_NUMBERS = [63];

const looksIkea = (name, number) => {
  const up = String(name || '').toUpperCase();
  return IKEA_NUMBERS.includes(number)
    || /\bIKEA\b|ИКЕА|ИКЕЯ/.test(up)
    || IKEA_NAMES.some(n => up.includes(n));
};

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(MONGO_URI);

  const launches = await ProductLaunch.find().sort({ number: 1 });
  let changed = 0;

  for (const l of launches) {
    let supplier = '';
    let why = '';

    if (l.product) {
      const p = await Product.findById(l.product).select('supplier');
      if (p?.supplier?.company) { supplier = p.supplier.company; why = 'из карточки товара'; }
    }
    if (!supplier && looksIkea(l.name, l.number)) { supplier = 'IKEA'; why = 'по названию'; }

    if (!supplier || supplier === l.supplier) continue;
    console.log(`#${l.number} ${l.name} → ${supplier} (${why})`);
    changed++;
    if (apply) { l.supplier = supplier; await l.save(); }
  }

  console.log(`\n${apply ? 'Обновлено' : 'Будет обновлено'}: ${changed} из ${launches.length}`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
