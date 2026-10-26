/**
 * Лист стальной (YNTYMAK ZAKUP), 26.10.2026, по слову руководителя:
 *  · горячекатаный (г/к) убираем — продаём только холоднокатаный (х/к);
 *  · цена х/к листа = масса листа (кг) × 200 сом; нет массы — цену не ставим.
 *
 *   node scripts/sheets-hk-price.js          — показать
 *   node scripts/sheets-hk-price.js --apply  — удалить г/к, записать цены (бэкап)
 *   node scripts/sheets-hk-price.js --undo   — вернуть г/к и прежние цены
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const MONGO_URI = require('../lib/atlas');

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const BACKUP = path.join(__dirname, 'sheets-hk-price.backup.json');
const PER_KG = 200;

const specOf = (p, re) => (p.specs || []).find(s => re.test(s?.key || '') && s?.value)?.value;
const isHot = p => /г\/к|горяче/i.test(`${p.name} ${specOf(p, /^сталь/i) || ''}`);
const massOf = p => parseFloat(String(specOf(p, /масса/i) || '').replace(',', '.').replace(/[^\d.]/g, ''));

(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (UNDO) {
    const docs = EJSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of docs) await P.replaceOne({ _id: d._id }, d, { upsert: true });
    console.log('Вернул', docs.length);
    return mongoose.disconnect();
  }
  const all = await P.find({ brand: 'matkasym-kyzmat', set: 'yntymak-zakup', category: 'Металлические листы' }).toArray();
  const hot = all.filter(isHot);
  const cold = all.filter(p => !isHot(p));
  hot.forEach(p => console.log('удалить г/к |', p.name));
  const priced = cold.map(p => ({ p, mass: massOf(p) })).map(x => ({ ...x, price: x.mass > 0 ? Math.round(x.mass * PER_KG) : 0 }));
  priced.forEach(x => console.log(`х/к | ${x.p.name} | масса ${x.mass || '—'} | цена ${x.price || 'не ставим'} (была ${x.p.price})`));
  if (!APPLY) { console.log(`Предпросмотр: удалить ${hot.length}, цены ${priced.filter(x => x.price).length}. Записать — --apply`); return mongoose.disconnect(); }
  fs.writeFileSync(BACKUP, EJSON.stringify([...hot, ...cold], null, 1, { relaxed: false }));
  await P.deleteMany({ _id: { $in: hot.map(p => p._id) } });
  for (const x of priced.filter(y => y.price)) {
    await P.updateOne({ _id: x.p._id }, { $set: { price: x.price, priceUndefined: false, updatedAt: new Date() } });
  }
  console.log(`Удалено г/к: ${hot.length}. Цены записаны: ${priced.filter(x => x.price).length}. Бэкап: ${path.basename(BACKUP)}`);
  await mongoose.disconnect();
})();
