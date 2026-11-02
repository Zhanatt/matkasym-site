// Пластиковые баки и урны сета 0-tashtandy: снять статус «ликвидация» (просил пользователь 02.11.2026),
// у GWR2 поправить число секций на 2. Без --apply только печатает. Откат: --undo из бэкапа.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const BACKUP = path.join(__dirname, 'unliquidate-plastic-0-tastandy.backup.json');
const apply = process.argv.includes('--apply'), undo = process.argv.includes('--undo');

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('products');
  if (undo) {
    for (const d of JSON.parse(fs.readFileSync(BACKUP, 'utf8'))) {
      const set = { productStatus: d.productStatus, specs: d.specs };
      if (d.liquidatedAt) set.liquidatedAt = new Date(d.liquidatedAt);
      await col.updateOne({ _id: new mongoose.Types.ObjectId(d._id) }, { $set: set });
    }
    console.log('Откат выполнен'); process.exit(0);
  }
  const plastic = await col.find({ set: '0-tashtandy', category: 'Пластиковые баки', productStatus: 'liquidation' }).toArray();
  const gwr2 = await col.findOne({ set: '0-tashtandy', sku: 'СЗ0048W2' });
  plastic.forEach(p => console.log(p.sku, '|', p.name, '| liquidation → for_sale'));
  console.log(gwr2.sku, '|', gwr2.name, '| Кол-во секций:', gwr2.specs.find(s => s.key === 'Кол-во секций')?.value, '→ 2');
  if (!apply) { console.log('\nПредпросмотр. Для записи: --apply'); process.exit(0); }
  if (fs.existsSync(BACKUP)) throw new Error('Бэкап уже есть: ' + BACKUP);
  fs.writeFileSync(BACKUP, JSON.stringify([...plastic, gwr2].map(d => ({ _id: d._id, productStatus: d.productStatus, liquidatedAt: d.liquidatedAt, specs: d.specs })), null, 1));
  for (const p of plastic) await col.updateOne({ _id: p._id }, { $set: { productStatus: 'for_sale' }, $unset: { liquidatedAt: '' } });
  await col.updateOne({ _id: gwr2._id, 'specs.key': 'Кол-во секций' }, { $set: { 'specs.$.value': '2' } });
  console.log(`\nОбновлено: ${plastic.length} + GWR2. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
