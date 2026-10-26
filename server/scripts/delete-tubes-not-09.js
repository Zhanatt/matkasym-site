/**
 * DAYAR TÜTÜK: продаём только трубы со стенкой 0,9 и 0,95 мм (сказал руководитель
 * 26.10.2026). Остальные толщины удаляем с сайта — карточки целиком, фото в
 * Cloudinary не трогаем (на те же снимки ссылаются оставшиеся трубы).
 *
 *   node scripts/delete-tubes-not-09.js                  — показать
 *   node scripts/delete-tubes-not-09.js --apply          — удалить без остатка
 *   node scripts/delete-tubes-not-09.js --apply --with-stock — и с остатком тоже
 *   node scripts/delete-tubes-not-09.js --undo           — вернуть из бэкапа
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const APPLY = process.argv.includes('--apply');
const WITH_STOCK = process.argv.includes('--with-stock');
const UNDO = process.argv.includes('--undo');
const BACKUP = path.join(__dirname, 'delete-tubes-not-09.backup.json');
const KEEP = [0.9, 0.95];

const wallOf = p => {
  const s = (p.specs || []).find(x => /толщина стенки/i.test(x.key || ''))?.value;
  const last = (String(p.name).replace(/\([^)]*\)/g, '').match(/\d+(?:[.,]\d+)?/g) || []).pop();
  return parseFloat(String(s || last).replace(',', '.'));
};

(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (UNDO) {
    const { EJSON } = require('bson');
    const docs = EJSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of docs) { await P.replaceOne({ _id: d._id }, d, { upsert: true }); console.log('Вернул', d.name); }
    return mongoose.disconnect();
  }
  const all = await P.find({ brand: 'matkasym-kyzmat', set: 'dayar-tutuk', category: { $not: /резк/i } }).toArray();
  const del = all.filter(p => !KEEP.includes(wallOf(p)) && (WITH_STOCK || !(p.stock > 0)));
  const skipped = all.filter(p => !KEEP.includes(wallOf(p)) && !del.includes(p));
  del.forEach(p => console.log(`удалить  ${wallOf(p)} | ${p.name} | остаток ${p.stock || 0}`));
  skipped.forEach(p => console.log(`оставлен ${wallOf(p)} | ${p.name} | остаток ${p.stock} (нужен --with-stock)`));
  if (!APPLY) { console.log(`Предпросмотр: ${del.length} к удалению. Записать — --apply`); return mongoose.disconnect(); }
  const { EJSON } = require('bson');
  const prev = fs.existsSync(BACKUP) ? EJSON.parse(fs.readFileSync(BACKUP, 'utf8')) : [];
  fs.writeFileSync(BACKUP, EJSON.stringify([...prev, ...del], null, 1, { relaxed: false }));
  const r = await P.deleteMany({ _id: { $in: del.map(p => p._id) } });
  console.log(`Удалено: ${r.deletedCount}. Бэкап: ${path.basename(BACKUP)}`);
  await mongoose.disconnect();
})();
