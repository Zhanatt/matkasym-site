// Порядок категорий в сете UZAK KOLDON (12.10.2026): сначала все шкафы, потом
// тумбы и остальное. Раньше расстановки не было — шли по алфавиту, и «Тумбы»
// вставали между гардеробными и офисными шкафами. Порядок общий для страницы
// сета и PDF; дальше правится кнопкой «Порядок».
// Без --apply только показывает. --undo удаляет расстановку (если её создал скрипт).
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const SetLayout = require('../models/SetLayout');

const BRAND = 'matkasym-shaar', SET = 'uzak-koldon';
const ORDER = ['Гардеробные шкафы', 'Шкафы офисные', 'Шкафы инструментальные', 'Карточные шкафы', 'Тумбы', 'Сейф', 'Постамат'];

(async () => {
  await mongoose.connect(MONGO_URI);
  const existing = await SetLayout.findOne({ brand: BRAND, set: SET }).lean();
  if (process.argv.includes('--undo')) {
    if (existing?.createdByScript) { await SetLayout.deleteOne({ _id: existing._id }); console.log('Расстановка удалена'); }
    else console.log('Нечего откатывать');
    return process.exit(0);
  }
  console.log('Сейчас:', existing ? existing.categories.join(' → ') : 'расстановки нет (по алфавиту)');
  console.log('Будет: ', ORDER.join(' → '));
  if (existing) { console.error('Расстановка уже есть — правьте кнопкой «Порядок», скрипт её не перезаписывает'); process.exit(1); }
  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }
  await SetLayout.collection.insertOne({ brand: BRAND, set: SET, categories: ORDER, productOrder: [],
    createdByScript: true, createdAt: new Date(), updatedAt: new Date() });
  console.log('Готово');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
