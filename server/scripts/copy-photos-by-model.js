// Перенос фото со старой карточки товара на новую — когда в 1С поменялась
// номенклатура и тот же товар завёлся заново, уже без фото.
//
// Так было со стеллажами ADIK (11.08.2026): обновление остатков MAKE IN завело
// 21 новую карточку с остатком и без единого фото, а старые карточки с фото
// остались висеть с нулём.
//
// Пара «новая → старая» ищется по МОДЕЛИ, а не по названию целиком: у новых
// карточек в названии появился цвет («ROUND X5 120х40х175 белый»), а у старых
// его нет. Ключ модели = серия + код + габариты, всё остальное отбрасывается.
//
// Запуск (из server/):
//   node scripts/copy-photos-by-model.js                 # только показать, что будет
//   node scripts/copy-photos-by-model.js --apply         # записать
//   node scripts/copy-photos-by-model.js --filter=ADIK   # ограничить выборку (по умолчанию ADIK)
//
// Без --apply ничего не пишется. Перед записью затронутые документы выгружаются
// в scripts/backup-photos-<дата>.json — откатывать этим же файлом.
const fs   = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const APPLY  = process.argv.includes('--apply');
const FILTER = (process.argv.find(a => a.startsWith('--filter=')) || '--filter=ADIK').split('=')[1];

// Кириллические двойники латиницы: в номенклатуре 1С «А3», «М4», «В3», «С4»
// набраны русскими буквами, а в старых карточках — латиницей. Глазами не отличить,
// а для поиска это разные строки.
const HOMOGLYPHS = { а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x' };

// Серии стеллажей. GUARDIAL — опечатка в номенклатуре, тот же GUARDRAIL.
const SERIES  = ['round', 'slotted', 'guardrail', 'storage', 'light', 'medium', 'heavy'];
const ALIASES = { guardial: 'guardrail', guardrall: 'guardrail' };

const COLORS = /\b(бел(ый|ая|ое)|черн(ый|ая|ое)|чёрн(ый|ая|ое)|сер(ый|ая|ое)|беж(евый)?)\b/gi;

function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(COLORS, ' ')
    .replace(/[а-яё]/g, ch => HOMOGLYPHS[ch] || ch)   // русские двойники → латиница
    .replace(/[*×хx]/g, 'x')                          // 120*40*80 = 120х40х80 = 120x40x80
    .replace(/\s+/g, ' ')
    .trim();
}

// Ключ модели: серия + код + габариты. Нужны минимум две части из трёх —
// по одному коду «C4» матчить нельзя, так недолго склеить разные товары.
function modelKey(name) {
  const s = normalize(name);
  const words = s.split(/[\s,()]+/).map(w => ALIASES[w] || w);

  const series = words.filter(w => SERIES.includes(w));
  const codes  = words.filter(w => /^[a-z]\d{1,2}$/.test(w));
  const dims   = (s.match(/\d{2,4}x\d{2,4}(x\d{2,4})?/g) || []);

  const parts = [series.join('+'), codes.join('+'), dims.join('+')];
  const filled = parts.filter(Boolean).length;
  if (filled < 2) return '';
  return parts.join('|');
}

const photosOf = p => [...(p.images || []).filter(Boolean), ...(p.driveImages || []).filter(Boolean)].length;

(async () => {
  await mongoose.connect(MONGO_URI);

  const re = new RegExp(FILTER, 'i');
  const all = await Product.find({ $or: [{ name: re }, { fullName: re }, { sku: re }] })
    .select('sku name fullName images driveImages stock brand set category productStatus')
    .lean();

  console.log(`Товаров по фильтру «${FILTER}»: ${all.length}`);

  // Цель — карточка без единого фото, но с остатком: это и есть новая
  // номенклатура. Карточки без фото и без остатка не трогаем: их судьба
  // (удалить или слить) решается отдельно, фото им ни к чему.
  const targets = all.filter(p => photosOf(p) === 0 && (Number(p.stock) || 0) > 0);
  const sources = all.filter(p => photosOf(p) > 0);

  console.log(`Без фото и с остатком: ${targets.length} | с фото (доноры): ${sources.length}\n`);

  const byKey = new Map();
  for (const s of sources) {
    const key = modelKey(s.fullName || s.name);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(s);
  }

  const plan = [];
  const skipped = [];

  for (const t of targets) {
    const key = modelKey(t.fullName || t.name);
    if (!key) { skipped.push({ t, why: 'не удалось определить модель по названию' }); continue; }

    // Обычно донор берётся того же бренда: один код серии встречается и в HOME,
    // и в SHAAR. Но если в ключе есть габариты, совпадение точное — тот же товар
    // и есть: старые карточки ADIK лежали под SHAAR, новые завелись под HOME.
    const strong = /\d{2,4}x\d{2,4}/.test(key);
    const cands = (byKey.get(key) || [])
      .filter(s => String(s._id) !== String(t._id))
      .filter(s => strong || s.brand === t.brand);
    if (!cands.length) { skipped.push({ t, why: `нет старой карточки с фото (модель ${key})` }); continue; }

    // Больше фото — лучше карточка. При равенстве берём первую попавшуюся:
    // дубли старых карточек отличаются только опечаткой в названии.
    // Свой бренд вперёд, дальше — у кого больше фото.
    cands.sort((a, b) => (b.brand === t.brand) - (a.brand === t.brand) || photosOf(b) - photosOf(a));
    plan.push({ t, s: cands[0], key, alt: cands.slice(1) });
  }

  console.log('=== ЧТО БУДЕТ СКОПИРОВАНО ===');
  for (const { t, s, key, alt } of plan) {
    console.log(`\n${t.fullName || t.name}  (остаток ${t.stock})`);
    console.log(`  ← ${s.sku || 'без артикула'} | ${s.fullName || s.name} | фото: ${photosOf(s)}`
      + (s.brand === t.brand ? '' : `  ⚠ донор другого бренда: ${s.brand}`));
    console.log(`  модель: ${key}`);
    if (alt.length) console.log(`  ещё доноры с той же моделью: ${alt.map(a => a.sku || a.name).join(', ')}`);
  }

  if (skipped.length) {
    console.log('\n=== БЕЗ ДОНОРА (останутся без фото) ===');
    skipped.forEach(({ t, why }) => console.log(`• ${t.fullName || t.name} (остаток ${t.stock}) — ${why}`));
  }

  console.log(`\nИтого: перенос у ${plan.length}, без донора ${skipped.length}`);

  if (!APPLY) {
    console.log('\nЭто предпросмотр. Записать: node scripts/copy-photos-by-model.js --apply');
    await mongoose.disconnect();
    return;
  }

  // Бэкап ДО записи: в файле полные документы целевых карточек.
  const backup = path.join(__dirname, `backup-photos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`);
  const before = await Product.find({ _id: { $in: plan.map(p => p.t._id) } }).lean();
  fs.writeFileSync(backup, JSON.stringify(before, null, 2));
  console.log(`\nБэкап целевых карточек: ${backup}`);

  let done = 0;
  for (const { t, s } of plan) {
    await Product.updateOne({ _id: t._id }, {
      $set: {
        images:      (s.images || []).filter(Boolean),
        driveImages: (s.driveImages || []).filter(Boolean),
      },
    });
    done++;
  }
  console.log(`Обновлено карточек: ${done}`);

  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
