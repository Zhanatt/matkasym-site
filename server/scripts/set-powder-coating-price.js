/**
 * Порошковая покраска (ÖNDÜRÜÜ): 350 сом за 1 кг веса изделия, порошок включён.
 * Цену назвал руководитель 26.10.2026, до этого в карточке стояло «цена не указана».
 *
 *   node scripts/set-powder-coating-price.js          — показать
 *   node scripts/set-powder-coating-price.js --apply  — записать (бэкап рядом)
 *   node scripts/set-powder-coating-price.js --undo   — вернуть из бэкапа
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const BACKUP = path.join(__dirname, 'set-powder-coating-price.backup.json');
const PRICE = 350;
const SPECS = [
  { key: 'Тип услуги', value: 'Порошковая покраска' },
  { key: 'Стоимость', value: '350 сом за 1 кг веса изделия (порошок включён)' },
  { key: 'Цвет', value: 'по каталогу RAL' },
];

(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (UNDO) {
    const docs = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of docs) {
      await P.updateOne({ _id: new mongoose.Types.ObjectId(d._id) },
        { $set: { price: d.price, priceUndefined: d.priceUndefined, specs: d.specs } });
      console.log('Вернул', d.name);
    }
    return mongoose.disconnect();
  }
  const docs = await P.find({ brand: 'matkasym-kyzmat', set: 'onuguu-set', name: /порошков/i })
    .project({ name: 1, price: 1, priceUndefined: 1, specs: 1 }).toArray();
  docs.forEach(d => console.log(`${d.name}: ${d.price} (priceUndefined ${d.priceUndefined}) → ${PRICE}`));
  if (!APPLY) { console.log('Предпросмотр. Записать — --apply'); return mongoose.disconnect(); }
  fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 1));
  for (const d of docs) {
    // Стоимость в характеристиках раньше была «по площади и сложности» — заменяем
    const keep = (d.specs || []).filter(s => !SPECS.some(n => n.key.toLowerCase() === String(s.key).toLowerCase()));
    await P.updateOne({ _id: d._id }, { $set: { price: PRICE, priceUndefined: false, specs: [...SPECS, ...keep], updatedAt: new Date() } });
  }
  console.log(`Записано: ${docs.length}. Бэкап: ${path.basename(BACKUP)}`);
  await mongoose.disconnect();
})();
