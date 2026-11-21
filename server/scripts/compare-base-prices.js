/**
 * Сверка прайсов Make-in и Matkasym.
 *
 * Один и тот же товар лежит в обеих базах, и цена у него должна быть одна:
 * расходятся они не потому, что так решили, а потому что прайс правили в одной
 * базе и забыли во второй. Скрипт только читает и показывает, где разошлось.
 *
 * Пустая цена — не расхождение, а «прайс этой базы не загружали»: такие позиции
 * идут отдельным списком, сравнивать там нечего.
 *
 *   node scripts/compare-base-prices.js
 *   node scripts/compare-base-prices.js --set=baary-oorunda
 *   node scripts/compare-base-prices.js --filter=ADIK
 *   node scripts/compare-base-prices.js --csv > /tmp/prices.csv
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');
const { PRICE_TYPES } = require('../lib/stockBases');

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || '';
const CSV = process.argv.includes('--csv');
const SET = arg('set');
const FILTER = arg('filter');

const A = 'makein', B = 'matkasym';
// Экспортный прайс есть только у Matkasym — сравнивать не с чем.
const TYPES = ['retail', 'wholesale', 'dealer', 'cost'];

const money = n => (Number(n) > 0 ? Number(n).toLocaleString('ru') : '—');
const pad = (s, n) => String(s).padEnd(n);

(async () => {
  await mongoose.connect(MONGO_URI);

  const q = {};
  if (SET) q.set = SET;
  if (FILTER) q.$or = [{ name: new RegExp(FILTER, 'i') }, { fullName: new RegExp(FILTER, 'i') }];
  const products = await Product.find(q).select('name fullName sku set pricesByBase stockByBase').lean();

  const diffs = [];   // цена есть у обеих и не совпала
  const oneSided = [];  // цена есть только у одной базы
  for (const p of products) {
    const a = p.pricesByBase?.[A] || {};
    const b = p.pricesByBase?.[B] || {};
    for (const t of TYPES) {
      const va = Number(a[t] || 0), vb = Number(b[t] || 0);
      if (!va && !vb) continue;
      const row = { p, type: t, a: va, b: vb };
      if (va && vb) { if (va !== vb) diffs.push(row); }
      else oneSided.push(row);
    }
  }

  if (CSV) {
    console.log('sku;товар;сет;тип цены;Make-in;Matkasym;разница');
    for (const d of [...diffs, ...oneSided]) {
      console.log([d.p.sku || '', d.p.fullName || d.p.name, d.p.set || '',
        PRICE_TYPES[d.type].label, d.a, d.b, d.a && d.b ? d.b - d.a : ''].join(';'));
    }
    await mongoose.disconnect();
    return;
  }

  const scope = [SET && `сет ${SET}`, FILTER && `фильтр «${FILTER}»`].filter(Boolean).join(', ') || 'весь каталог';
  console.log(`Проверено: ${products.length} карточек (${scope})\n`);

  console.log(`РАСХОЖДЕНИЯ — цена есть у обеих баз и разная: ${diffs.length}`);
  if (diffs.length) {
    console.log(pad('артикул', 18) + pad('тип', 12) + pad('Make-in', 12) + pad('Matkasym', 12) + pad('разница', 10) + 'товар');
    // Сначала самые крупные расхождения: с них и начинать разбор.
    diffs.sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a));
    for (const d of diffs) {
      const delta = d.b - d.a;
      console.log(pad(d.p.sku || '(без арт.)', 18) + pad(PRICE_TYPES[d.type].label.replace(' цены', ''), 12)
        + pad(money(d.a), 12) + pad(money(d.b), 12)
        + pad(`${delta > 0 ? '+' : ''}${delta.toLocaleString('ru')}`, 10) + (d.p.fullName || d.p.name));
    }
  }

  console.log(`\nЦЕНА ТОЛЬКО У ОДНОЙ БАЗЫ — сравнивать не с чем: ${oneSided.length}`);
  if (oneSided.length) {
    console.log(pad('артикул', 18) + pad('тип', 12) + pad('Make-in', 12) + pad('Matkasym', 12) + 'товар');
    for (const d of oneSided) {
      console.log(pad(d.p.sku || '(без арт.)', 18) + pad(PRICE_TYPES[d.type].label.replace(' цены', ''), 12)
        + pad(money(d.a), 12) + pad(money(d.b), 12) + (d.p.fullName || d.p.name));
    }
  }

  await mongoose.disconnect();
})();
