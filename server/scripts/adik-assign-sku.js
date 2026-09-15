/**
 * Артикулы стеллажам ADIK в сете Baary Oorunda.
 *
 * У 21 карточки из 22 поле `sku` пустое, а для Ммаркет это колонка A —
 * «Уникальный идентификатор товара». По нему площадка опознаёт товар, и
 * менять его после первой загрузки уже нельзя: сходятся остатки и заказы.
 *
 * Серия `MKS-AD-###` — по образцу тех, что в сете уже есть (MKS-BO-001,
 * MKS-XX-048). Нумеруем в порядке прайс-листа: линейка, внутри — от большего
 * к меньшему, чёрный раньше белого. Порядок фиксированный, чтобы повторный
 * запуск не перетасовал номера.
 *
 * Карточку, у которой артикул уже есть, не трогаем.
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

// Порядок нумерации: как модели идут в прайс-листе.
const ORDER = ['ROUND X5', 'ROUND X4', 'ROUND X3', 'ROUND S4', 'ROUND S3',
               'GUARDRAIL M4', 'GUARDRAIL M3', 'SLOTTED A5', 'SLOTTED A4',
               'SLOTTED A3', 'SLOTTED B3', 'C4'];

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
    'sku name fullName stock',
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

  const busy = new Set((await Product.find({ sku: /^MKS-AD-/ }, 'sku').lean()).map(p => p.sku));
  let n = 0;
  const nextSku = () => {
    let s;
    do { n += 1; s = `MKS-AD-${String(n).padStart(3, '0')}`; } while (busy.has(s));
    busy.add(s);
    return s;
  };

  const plan = [];
  for (const p of list) {
    if (p.sku) { console.log(`${p.sku.padEnd(12)} уже есть   ${p.name}`); continue; }
    plan.push({ id: p._id, sku: nextSku(), name: p.name });
  }
  plan.forEach(x => console.log(`${x.sku.padEnd(12)} ←          ${x.name}`));
  console.log(`\nВсего под выгрузку: ${list.length}; проставим артикулов: ${plan.length}`);

  if (!APPLY) {
    console.log('Это предпросмотр. Записать: node scripts/adik-assign-sku.js --apply');
    await mongoose.disconnect();
    return;
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = path.join(__dirname, `backup-adik-sku-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(plan.map(x => ({ _id: x.id, sku: '' })), null, 2));
  console.log(`Бэкап: ${path.relative(process.cwd(), file)}`);

  for (const x of plan) await Product.updateOne({ _id: x.id }, { $set: { sku: x.sku } });
  console.log(`Проставлено: ${plan.length}`);
  await mongoose.disconnect();
})();
