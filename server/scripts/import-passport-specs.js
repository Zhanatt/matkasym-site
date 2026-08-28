/**
 * Заливает характеристики из паспортов качества (сервер отдела разработки) в карточки товаров.
 *
 * План соответствий готовит питоновский разбор паспортов и кладёт в JSON:
 *   [{ du, folder, file, skip, products: [id], set: {dimensions, description}, specs: {ключ: значение} }]
 *
 * Заполняем ТОЛЬКО пустые поля — если в базе уже что-то стоит и расходится с паспортом,
 * значение остаётся как есть и попадает в отчёт.
 *
 *   node scripts/import-passport-specs.js <plan.json>            # предпросмотр
 *   node scripts/import-passport-specs.js <plan.json> --apply    # запись + бэкап
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const planPath = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!planPath) {
  console.error('Укажите путь к плану: node scripts/import-passport-specs.js <plan.json> [--apply]');
  process.exit(1);
}

const norm = v => String(v ?? '').replace(/\s+/g, ' ').trim();

(async () => {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')).filter(e => !e.skip && e.products?.length);
  await mongoose.connect(MONGO_URI);

  const ids = [...new Set(plan.flatMap(e => e.products))];
  const products = await Product.find({ _id: { $in: ids } });
  const byId = new Map(products.map(p => [String(p._id), p]));

  if (APPLY) {
    const backup = path.join(path.dirname(planPath), `backup-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify(
      products.map(p => ({
        _id: String(p._id), fullName: p.fullName,
        dimensions: p.dimensions, description: p.description,
        specs: (p.specs || []).map(s => ({ key: s.key, value: s.value, options: s.options })),
      })), null, 1));
    console.log('Бэкап:', backup);
  }

  let filled = 0, kept = 0, saved = 0;
  const conflicts = [];

  for (const entry of plan) {
    for (const pid of entry.products) {
      const p = byId.get(pid);
      if (!p) { console.warn('нет товара', pid, entry.du); continue; }
      let dirty = false;

      for (const [field, value] of Object.entries(entry.set || {})) {
        const cur = norm(p[field]);
        if (!cur) { p[field] = value; filled++; dirty = true; }
        else if (cur !== norm(value)) { conflicts.push([entry.du, p.fullName, field, cur, value]); kept++; }
      }

      const specs = p.specs || [];
      for (const [key, value] of Object.entries(entry.specs || {})) {
        const hit = specs.find(s => norm(s.key).toLowerCase() === key.toLowerCase());
        if (!hit) { specs.push({ key, value, options: [] }); filled++; dirty = true; }
        else if (!norm(hit.value)) { hit.value = value; filled++; dirty = true; }
        else if (norm(hit.value) !== norm(value)) { conflicts.push([entry.du, p.fullName, `спец: ${key}`, norm(hit.value), value]); kept++; }
      }
      if (dirty) { p.specs = specs; p.markModified('specs'); if (APPLY) { await p.save(); } saved++; }
    }
  }

  console.log(`\n${APPLY ? 'ЗАПИСАНО' : 'ПРЕДПРОСМОТР'}: паспортов ${plan.length}, товаров ${saved}, полей заполнено ${filled}`);
  console.log(`Оставлено как есть (расходится с паспортом): ${kept}`);
  if (conflicts.length) {
    console.log('\n─── расхождения (в базе оставлено своё) ───');
    for (const [du, name, field, cur, val] of conflicts) {
      console.log(`${du.padEnd(9)} ${name.slice(0, 38).padEnd(38)} ${field.slice(0, 24).padEnd(24)} база «${cur.slice(0, 24)}» ≠ паспорт «${String(val).slice(0, 24)}»`);
    }
  }
  if (!APPLY) console.log('\nЭто предпросмотр. Запуск с --apply запишет изменения.');
  await mongoose.disconnect();
})();
