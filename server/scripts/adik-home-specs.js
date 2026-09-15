/**
 * Характеристики стеллажей ADIK HOME по розничному прайс-листу 2026.
 *
 * Источник — «Прайс-лист_ADIK_HOME_2026.pdf» (10 моделей, по странице на модель).
 * В карточках сета Baary Oorunda у этих стеллажей не было ни габаритов, ни одной
 * характеристики: на витрине и в PDF-каталоге они шли голым названием.
 *
 * Пишем: габариты, число полок, нагрузку на полку, вес, размер упаковки и цвет.
 * Цвет ставим в оба места сразу — поле `color` красит кружок-образец в каталоге,
 * характеристика «Цвет» стоит в карточках сета, PDF и постах.
 *
 * Модель узнаём по названию: ROUND X5, SLOTTED A3 и т.д. Цвет — по «(белый)» /
 * «(черный)» там же. Чего в прайсе нет — не выдумываем: у SLOTTED A4 прайс молчит
 * про вес и упаковку, у «ADIK HOME С4» нет страницы вовсе.
 *
 *   node scripts/adik-home-specs.js            # только показать, что изменится
 *   node scripts/adik-home-specs.js --apply    # записать
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const APPLY = process.argv.includes('--apply');
const SET = 'baary-oorunda';

// Прайс-лист, страница на модель. Нагрузка и упаковка — как напечатано.
// wheels — с фотографии в прайсе: у GUARDRAIL обе модели на колёсах.
const MODELS = {
  'ROUND X5':     { dims: '120x40x175', shelves: 5, load: '25–40', weight: 12, pack: '46×123×13' },
  'ROUND X4':     { dims: '50x30x155',  shelves: 4, load: '25–40', weight: 6,  pack: '36×63×11' },
  'ROUND X3':     { dims: '120x40x80',  shelves: 3, load: '25–40', weight: 8,  pack: '46×123×9' },
  'ROUND S4':     { dims: '50x30x120',  shelves: 4, load: '25–40', weight: 6,  pack: '36×63×11' },
  'ROUND S3':     { dims: '50x30x80',   shelves: 3, load: '25–40', weight: 5,  pack: '36×63×9' },
  'GUARDRAIL M4': { dims: '80x35x135',  shelves: 4, load: '25–40', weight: 8,  pack: '41×83×11', wheels: true },
  'GUARDRAIL M3': { dims: '80x35x95',   shelves: 3, load: '25–40', weight: 6,  pack: '41×83×9',  wheels: true },
  'SLOTTED A5':   { dims: '120x40x183', shelves: 5, load: '30–60', weight: 18, pack: '46×126×13' },
  'SLOTTED A3':   { dims: '120x40x80',  shelves: 3, load: '30–60', weight: 12, pack: '46×126×9' },
  'SLOTTED B3':   { dims: '80x40x80',   shelves: 3, load: '30–60', weight: 8,  pack: '46×86×9' },
  // Страницы в прайсе нет. Габариты и число полок стоят в самом названии
  // (цифра в коде модели — это полки), нагрузка одна на всю линейку SLOTTED.
  // Вес и упаковку оставляем пустыми: выдумывать их неоткуда.
  'SLOTTED A4':   { dims: '120x40x183', shelves: 4, load: '30–60', partial: true },
};

// В базе модель пишут и «GUARDAIL» (без R) — это та же линейка.
//
// Буква кода набрана то латиницей, то кириллицей: «SLOTTED A3» и «SLOTTED А3»
// выглядят одинаково, а это разные символы, и по латинскому шаблону половина
// карточек не находилась вовсе. Кириллические двойники приводим к латинице —
// но только те, что действительно двойники: «С» в «ADIK HOME С4» это не S,
// и такой стеллаж к линейкам прайса не относится.
const LOOKALIKE = { 'А': 'A', 'В': 'B', 'М': 'M', 'Х': 'X' };

const modelOf = (name) => {
  const m = String(name).match(/\b(ROUND|SLOTTED|GUARD?RAIL|GUARDAIL)\s*([XSMABХМВА])\s*(\d)/i);
  if (!m) return null;
  const family = /GUARD/i.test(m[1]) ? 'GUARDRAIL' : m[1].toUpperCase();
  const letter = m[2].toUpperCase();
  return `${family} ${LOOKALIKE[letter] || letter}${m[3]}`;
};

// Цвет из названия карточки: «(белый)», «(черный)», «… черный».
const colorOf = (name) => {
  if (/бел(ый|ая|ое)/i.test(name)) return { value: 'white', label: 'белый' };
  if (/ч[её]рн(ый|ая|ое)/i.test(name)) return { value: 'black', label: 'чёрный' };
  return null;
};

// Характеристику с таким ключом заменяем, остальные оставляем как были.
//
// Единица измерения входит в само значение: поля `unit` в схеме specs нет, и
// «12» вместо «12 кг» на витрине читалось бы непонятно чем.
const putSpec = (specs, key, value) => {
  const i = specs.findIndex(s => String(s.key).trim().toLowerCase() === key.toLowerCase());
  const row = { key, value: String(value) };
  if (i >= 0) specs[i] = { ...specs[i], ...row }; else specs.push(row);
};

(async () => {
  await mongoose.connect(MONGO_URI);

  const rows = await Product.find(
    { set: SET, $or: [{ name: /ADIK/i }, { fullName: /ADIK/i }] },
  ).lean();

  const plan = [], skipped = [];
  for (const p of rows) {
    const name = p.fullName || p.name || '';
    const model = modelOf(name);
    const spec = model && MODELS[model];
    if (!spec) { skipped.push({ name, why: model ? `модели ${model} нет в прайсе` : 'модель не распознана' }); continue; }

    const color = colorOf(name);
    const specs = (p.specs || []).map(s => ({ key: s.key, value: s.value, unit: s.unit || '' }));

    putSpec(specs, 'Полок', spec.shelves);
    putSpec(specs, 'Нагрузка на полку', `${spec.load} кг`);
    if (spec.weight) putSpec(specs, 'Вес', `${spec.weight} кг`);
    if (spec.pack)   putSpec(specs, 'Размер упаковки', `${spec.pack} см`);
    if (spec.wheels) putSpec(specs, 'Колёса', 'есть');
    if (color)       putSpec(specs, 'Цвет', color.label);

    const update = { dimensions: spec.dims, specs };
    if (color) update.color = color.value;

    plan.push({ id: p._id, name, model, partial: !!spec.partial, noColor: !color, update, before: p });
  }

  console.log(`Стеллажей ADIK в сете «${SET}»: ${rows.length}; заполняем: ${plan.length}\n`);
  for (const x of plan) {
    const s = x.update.specs.map(r => `${r.key}: ${r.value}`).join(' · ');
    console.log(`${x.model.padEnd(13)} ${x.name}`);
    console.log(`   габариты: ${x.update.dimensions}   ${s}`);
    if (x.partial)  console.log('   ! в прайсе этой модели нет — вес и упаковка не заполнены');
    if (x.noColor)  console.log('   ! цвет в названии не указан — поле цвета не трогаем');
  }
  if (skipped.length) {
    console.log('\nПропущены (в прайс-листе их нет):');
    skipped.forEach(x => console.log(`   ${x.name} — ${x.why}`));
  }

  if (!APPLY) {
    console.log('\nЭто предпросмотр. Записать: node scripts/adik-home-specs.js --apply');
    await mongoose.disconnect();
    return;
  }

  // Бэкап до записи: откатывать придётся именно эти поля.
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = path.join(__dirname, `backup-adik-specs-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(plan.map(x => ({
    _id: x.id, dimensions: x.before.dimensions || '', color: x.before.color || '', specs: x.before.specs || [],
  })), null, 2));
  console.log(`\nБэкап: ${path.relative(process.cwd(), file)}`);

  let n = 0;
  for (const x of plan) {
    await Product.updateOne({ _id: x.id }, { $set: x.update });
    n += 1;
  }
  console.log(`Обновлено карточек: ${n}`);
  await mongoose.disconnect();
})();
