/**
 * YNTYMAK ZAKUP → «Металлические листы»: листы стальные по прайсу
 * (ГОСТ 16523-97; 380-2005; 19903-74), фото таблицы от пользователя 24.10.2026.
 * На сайте склеиваются в одну карточку «Лист стальной», строки — размер и вид стали.
 *
 * Запуск из папки server:
 *   node scripts/add-steel-sheets-yntymak.js           — только показать
 *   node scripts/add-steel-sheets-yntymak.js --apply   — записать
 *
 * Цен в прайсе нет — цена не указана, продаётся поштучно (лист), «под заказ».
 * Карточку-пример «Металлический лист (пример)» убираем: её заменяют настоящие.
 * Повторный запуск ничего не дублирует; каждая карточка проверяется схемой Product.
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');
const APPLY = process.argv.includes('--apply');

// [толщина, масса кг, сталь]
const F1 = [ // 1000×2000
  ['0,5', '7,59', 'х/к'], ['0,6', '9,045', 'х/к'], ['0,7', '10,64', 'х/к'], ['0,85', '13,81', 'х/к'],
  ['0,9', '14,4', 'х/к'], ['1,0', '15,79', 'х/к'], ['1,1', '17,55', 'х/к'], ['1,2', '18,64', 'х/к'],
  ['1,4', '21,34', 'х/к'], ['1,4', '22,44', 'г/к'], ['1,5', '23,16', 'х/к'], ['1,5', '25', 'г/к'],
  ['1,8', '27,672', 'г/к'], ['1,8', '28,41', 'х/к'], ['1,9', '30,58', 'г/к'], ['1,9', '29,23', 'х/к'],
  ['2,0', '31,91', 'г/к'], ['2,0', '31,83', 'х/к'], ['2,5', '39,73', 'г/к'], ['2,8', '44,79', 'г/к'],
  ['2,9', '45,99', 'г/к'], ['3,0', '48,09', 'г/к'], ['3,8', '57,97', 'г/к'], ['4,0', '63,79', 'г/к'],
];
const F2 = [ // 1250×2500
  ['0,6', '14,46', 'х/к'], ['0,75', '19,38', 'х/к'], ['0,8', '20', 'х/к'], ['0,85', '21,324', 'х/к'],
  ['0,9', '21,65', 'х/к'], ['1,0', '24,53', 'х/к'], ['1,1', '26,89', 'х/к'], ['1,2', '29,21', 'х/к'],
  ['1,4', '34,02', 'х/к'], ['1,4', '33,85', 'г/к'], ['1,5', '36,24', 'х/к'], ['1,5', '39,33', 'г/к'],
  ['1,8', '44,54', 'х/к'], ['1,8', '45,82', 'г/к'], ['2,0', '49,27', 'х/к'], ['2,0', '50', 'г/к'],
  ['2,5', '61,51', 'г/к'], ['2,8', '68,9', 'г/к'], ['2,9', '70,5', 'г/к'], ['3,0', '74,12', 'г/к'],
  ['3,8', '95,00', 'г/к'],
];
const GOST = 'ГОСТ 16523-97; 380-2005; 19903-74';
const STEEL = { 'х/к': 'холоднокатаная', 'г/к': 'горячекатаная' };
const spec = (key, value) => ({ key, value, options: [] });

function card(t, kg, st, w, l) {
  const size = `${t}×${w}×${l}`;
  const name = `Лист стальной ${size} ${st}`;
  const hot = st === 'г/к';
  return {
    name, fullName: `Лист стальной ${STEEL[st]} ${t} мм, ${w}×${l} мм`,
    dimensions: `${size} мм`, unit: 'шт',
    description:
`Лист стальной ${STEEL[st]} (${st}) толщиной ${t} мм, формат ${w}×${l} мм. Масса листа — ${kg} кг.

${hot
  ? 'Горячекатаный лист — прочный и недорогой прокат для металлоконструкций, каркасов, ворот, заборов, ёмкостей и деталей, где важна прочность.'
  : 'Холоднокатаный лист — ровная гладкая поверхность и точная толщина: для гибки, лазерной резки, корпусов, коробов, мебели и деталей под покраску.'}

Изготовлен по ${GOST}. Продаётся поштучно (лист). Цену и наличие уточняйте у менеджера.`,
    specs: [
      spec('Толщина', `${t} мм`),
      spec('Формат листа', `${w}×${l} мм`),
      spec('Масса листа', `${kg} кг`),
      spec('Сталь', `${st} (${STEEL[st]})`),
      spec('ГОСТ', GOST),
    ],
  };
}

(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  const tpl = await P.findOne({ set: 'yntymak-zakup', category: 'Металлические листы' });
  if (!tpl) throw new Error('Нет карточки-образца в «Металлические листы»');
  const all = [...F1.map(r => card(...r, 1000, 2000)), ...F2.map(r => card(...r, 1250, 2500))];
  const existing = new Set((await P.find({ set: 'yntymak-zakup' }).project({ name: 1 }).toArray()).map(p => p.name));
  const docs = all.filter(c => !existing.has(c.name)).map(c => {
    const d = { ...tpl, ...c };
    delete d._id;
    Object.assign(d, {
      images: [], driveImages: [], tags: [], sku: '', nomenclature1C: '', color: '',
      price: 0, priceUndefined: true, priceCost: 0, priceWholesale: 0, priceDealer: 0,
      stock: 0, inStock: false, stockStatus: 'out_of_stock', isOnOrder: true, isNew: false,
      improvementHistory: [], createdAt: new Date(), updatedAt: new Date(),
    });
    const err = new Product(d).validateSync();
    if (err) throw new Error(`${c.name}: ${Object.keys(err.errors).join(', ')}`);
    return d;
  });
  console.log(`Листов в прайсе: ${all.length}; создать: ${docs.length}`);
  docs.slice(0, 3).forEach(d => console.log(`  ${d.name} | ${d.specs.map(s => s.value).join(' · ')}`));
  const example = await P.findOne({ set: 'yntymak-zakup', name: 'Металлический лист (пример)' });
  console.log(example ? 'Удалить пример: «Металлический лист (пример)»' : 'Примера нет');
  if (!APPLY) { console.log('Предпросмотр. Для записи: --apply'); return process.exit(0); }
  if (docs.length) await P.insertMany(docs);
  if (example) await P.deleteOne({ _id: example._id });
  console.log(`Готово: создано ${docs.length}${example ? ', пример удалён' : ''}`);
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
