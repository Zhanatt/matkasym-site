/**
 * Артикулы стеллажам ADIK в сете Baary Oorunda.
 *
 * У 21 карточки из 22 поле `sku` пустое, а для Ммаркет это колонка A —
 * «Уникальный идентификатор товара». По нему площадка опознаёт товар, и
 * менять его после первой загрузки уже нельзя: сходятся остатки и заказы.
 *
 * Схема: `MKS-<AH|AS>-<линейка>-<модель>-<цвет>`, например `MKS-AH-G-M3-BLK`.
 * AH — ADIK HOME, AS — ADIK STORAGE (так подписаны сами карточки); линейка
 * буквой: R — ROUND, S — SLOTTED, G — GUARDRAIL; дальше код модели и цвет,
 * BLK или WHT. У С4 линейки нет — она не входит ни в одну.
 *
 * Артикул читается глазами, и по нему сразу видно и линейку, и цвет: это
 * важнее сквозной нумерации, потому что на площадке артикул уже не сменить.
 *
 *   node scripts/adik-assign-sku.js            # показать, что будет
 *   node scripts/adik-assign-sku.js --apply    # записать
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const APPLY = process.argv.includes('--apply');
const SET = 'baary-oorunda';

// Порядок вывода: как модели идут в прайс-листе.
const ORDER = ['ROUND X5', 'ROUND X4', 'ROUND X3', 'ROUND S4', 'ROUND S3',
               'GUARDRAIL M4', 'GUARDRAIL M3', 'SLOTTED A5', 'SLOTTED A4',
               'SLOTTED A3', 'SLOTTED B3', 'C4'];

const LINE_CODE = { ROUND: 'R', SLOTTED: 'S', GUARDRAIL: 'G' };

// ADIK HOME и ADIK STORAGE — разные линейки прайса, и в названиях карточек они
// разведены. Артикул это сохраняет: у X3 обе версии совпали по габаритам, и
// без пометки они слились бы в один код.
const brandCode = (name) => (/ADIK\s+STORAGE/i.test(name) ? 'AS' : 'AH');

// Цвет берём из названия, а если там его нет — из поля карточки: у С4 цвет
// стоит только в поле, он определён по фотографии товара.
const colorCode = (name, color) => {
  if (/бел(ый|ая|ое)/i.test(name) || color === 'white') return 'WHT';
  if (/ч[её]рн(ый|ая|ое)/i.test(name) || color === 'black') return 'BLK';
  return '';   // цвет неизвестен — суффикса нет
};

function skuFor(name, model, color) {
  const parts = ['MKS', brandCode(name)];
  if (model === 'C4') parts.push('C4');
  else {
    const [family, code] = model.split(' ');
    parts.push(LINE_CODE[family], code);
  }
  const c = colorCode(name, color);
  if (c) parts.push(c);
  return parts.join('-');
}

const LOOKALIKE = { 'А': 'A', 'В': 'B', 'М': 'M', 'Х': 'X' };
const modelOf = (name) => {
  if (/ADIK\s+HOME\s+[CС]\s*4\b/i.test(name)) return 'C4';
  const m = String(name).match(/\b(ROUND|SLOTTED|GUARD?RAIL|GUARDAIL)\s*([XSMABХМВА])\s*(\d)/i);
  if (!m) return null;
  const family = /GUARD/i.test(m[1]) ? 'GUARDRAIL' : m[1].toUpperCase();
  const letter = m[2].toUpperCase();
  return `${family} ${LOOKALIKE[letter] || letter}${m[3]}`;
};
const colorRank = (name) => (/бел(ый|ая|ое)/i.test(name) ? 1 : 0);

(async () => {
  await mongoose.connect(MONGO_URI);

  const rows = await Product.find(
    { set: SET, $or: [{ name: /ADIK/i }, { fullName: /ADIK/i }] },
    'sku name fullName stock color',
  ).lean();

  // Дубли и остатки «по одной штуке» в выгрузку не идут — артикул им не нужен.
  const seen = new Set();
  const list = [];
  for (const p of rows) {
    const name = p.fullName || p.name || '';
    if ((p.stock || 0) <= 1) continue;
    const key = name.trim().toLowerCase();
    if (seen.has(key)) continue;           // вторая одинаковая карточка
    seen.add(key);
    list.push({ ...p, name, model: modelOf(name) });
  }

  list.sort((a, b) => {
    const ia = ORDER.indexOf(a.model), ib = ORDER.indexOf(b.model);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return colorRank(a.name) - colorRank(b.name);
  });

  const plan = [];
  const busy = new Map();
  for (const p of list) {
    const sku = skuFor(p.name, p.model, p.color);
    if (busy.has(sku)) {
      console.log(`⚠ ${sku} — код уже занят карточкой «${busy.get(sku)}», пропускаем: ${p.name}`);
      continue;
    }
    busy.set(sku, p.name);
    if (p.sku === sku) { console.log(`${sku.padEnd(18)} уже стоит  ${p.name}`); continue; }
    plan.push({ id: p._id, sku, was: p.sku || '', name: p.name });
  }
  plan.forEach(x => console.log(`${x.sku.padEnd(18)} ← ${(x.was || 'пусто').padEnd(12)} ${x.name}`));
  console.log(`\nВсего под выгрузку: ${list.length}; проставим артикулов: ${plan.length}`);

  if (!APPLY) {
    console.log('Это предпросмотр. Записать: node scripts/adik-assign-sku.js --apply');
    await mongoose.disconnect();
    return;
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = path.join(__dirname, `backup-adik-sku-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(plan.map(x => ({ _id: x.id, sku: x.was })), null, 2));
  console.log(`Бэкап: ${path.relative(process.cwd(), file)}`);

  for (const x of plan) await Product.updateOne({ _id: x.id }, { $set: { sku: x.sku } });
  console.log(`Проставлено: ${plan.length}`);
  await mongoose.disconnect();
})();
