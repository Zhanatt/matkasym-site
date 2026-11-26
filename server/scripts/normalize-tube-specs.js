/**
 * Характеристики труб к одному виду.
 *
 * Запуск из папки server:
 *   node scripts/normalize-tube-specs.js            — только показать, что изменится
 *   node scripts/normalize-tube-specs.js --apply    — записать
 *
 * Разнобой копился по мере наполнения сета: размер лежал и в поле «Габариты»,
 * и в характеристике — причём под четырьмя ключами («Диаметр», «Диаметр трубы»,
 * «Размер трубы», «Сечение»), из-за чего в карточке выходило два «Диаметра».
 * Про шов было три варианта ключа («Тип трубы», «тип турбы», «тип турбы » с
 * пробелом) и только у части позиций. Размер остаётся один — в поле «Габариты»,
 * как у остальных товаров сайта.
 *
 * Скрипт идемпотентный: повторный запуск ничего не портит.
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const APPLY = process.argv.includes('--apply');

const CATEGORIES = ['Трубы круглые', 'Трубы квадратные', 'Трубы прямоугольные', 'Трубы овальные'];

// Размер живёт в поле «Габариты» — единым источником, как у остальных товаров,
// поэтому характеристики-двойники размера из specs убираем.
const SIZE_KEYS = ['диаметр', 'диаметр трубы', 'размер трубы', 'сечение', 'габариты'];
const SEAM_KEYS = ['тип трубы', 'тип турбы', 'шов'];
const PACK_KEYS = ['количество', 'количество в одной пачке', 'количество в пачке'];

const norm = k => String(k || '').trim().toLowerCase();
const valueOf = (p, keys) => (p.specs || []).find(s => keys.includes(norm(s.key)))?.value?.trim() || '';

// «Труба круглая 16×0,5» → ['16', '0,5']; «Труба квадратная 15x15x0,9» → ['15x15', '0,9']
const fromName = (name) => {
  const tail = String(name || '').replace(/^.*?(\d)/, '$1').split(/[×x*]/).map(s => s.trim());
  return tail.length < 2 ? ['', ''] : [tail.slice(0, -1).join('×'), tail[tail.length - 1]];
};

(async () => {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const catSpecs = db.collection('categoryspecs');

  const tubes = await products.find({ set: 'dayar-tutuk', name: /^Труба/ }).toArray();
  const plan = [];

  for (const p of tubes) {
    const type  = valueOf(p, ['тип']) || '';
    const round = /кругл/i.test(type) || /кругл/i.test(p.name);
    const [nSize, nWall] = fromName(p.name);

    const rawSize = (valueOf(p, SIZE_KEYS) || p.dimensions || nSize)
      .replace(/\s*мм$/i, '').replace(/^[⌀Øø]\s*/, '').trim().replace(/[x*]/g, '×');
    const wall = (valueOf(p, ['толщина стенки']) || nWall).replace(/\s*мм$/i, '').replace(',', '.').trim();
    const pack = valueOf(p, PACK_KEYS);

    const specs = [
      { key: 'Тип',                 value: type || (round ? 'Круглая' : ''), options: [] },
      { key: 'Толщина стенки',      value: `${wall} мм`,                     options: [] },
      { key: 'Длина трубы',         value: valueOf(p, ['длина трубы']) || '6 м', options: [] },
      { key: 'Материал',            value: valueOf(p, ['материал']) || 'Металл',  options: [] },
      { key: 'Шов',                 value: 'Нет',            options: ['Есть', 'Нет'] },
      { key: 'Прокат',              value: 'Холоднокатаная', options: ['Холоднокатаная', 'Горячекатаная'] },
      { key: 'Страна производства', value: 'Россия',         options: [] },
    ];
    if (pack) specs.push({ key: 'Количество в пачке', value: pack, options: [] });

    const dimensions = round ? `⌀${rawSize} мм` : `${rawSize} мм`;
    const before = (p.specs || []).map(s => s.key).join(', ');
    plan.push({ _id: p._id, name: p.name, specs, dimensions, before, dimBefore: p.dimensions || '—' });
  }

  console.log(`труб: ${plan.length}`);
  const sample = plan[0];
  console.log(`\nпример — ${sample.name}`);
  console.log(`  было:  габариты «${sample.dimBefore}» + [${sample.before}]`);
  console.log(`  стало: габариты «${sample.dimensions}» + [${sample.specs.map(s => `${s.key}: ${s.value}`).join(', ')}]`);
  const keysBefore = new Set();
  tubes.forEach(p => (p.specs || []).forEach(s => keysBefore.add(s.key)));
  console.log(`\nбыло ключей всего: ${keysBefore.size} → станет 7–8 у каждой`);
  console.log([...keysBefore].map(k => `«${k}»`).join(', '));

  if (!APPLY) { console.log('\nПредпросмотр. Запусти с --apply.'); await mongoose.disconnect(); return; }

  for (const row of plan) {
    await products.updateOne({ _id: row._id },
      { $set: { specs: row.specs, dimensions: row.dimensions, updatedAt: new Date() } });
  }
  // чтобы «Шов» и «Прокат» были выпадающими списками в форме товара
  for (const category of CATEGORIES) {
    const now = new Date();
    await catSpecs.updateOne({ category },
      { $setOnInsert: { category, label: '', customSpecs: [], createdAt: now, __v: 0 }, $set: { updatedAt: now } },
      { upsert: true });
    const doc = await catSpecs.findOne({ category });
    const have = new Set((doc.customSpecs || []).map(s => norm(s.key)));
    const want = [
      { key: 'Шов',    type: 'select', options: ['Есть', 'Нет'] },
      { key: 'Прокат', type: 'select', options: ['Холоднокатаная', 'Горячекатаная'] },
      { key: 'Страна производства', type: 'text', options: [] },
    ].filter(s => !have.has(norm(s.key)));
    if (want.length) await catSpecs.updateOne({ category }, { $push: { customSpecs: { $each: want } } });
  }
  console.log('\n✔ записано');
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
