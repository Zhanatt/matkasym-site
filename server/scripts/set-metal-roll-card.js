/**
 * YNTYMAK ZAKUP: «Металлический рулон (пример)» → настоящая карточка (26.10.2026):
 * ширина 1000 и 1250 мм, длина разная, цена не определена.
 *   node scripts/set-metal-roll-card.js [--apply | --undo]
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const BACKUP = path.join(__dirname, 'set-metal-roll-card.backup.json');
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (process.argv.includes('--undo')) {
    const b = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    await P.updateOne({ _id: new mongoose.Types.ObjectId(b._id) }, { $set: { name: b.name, fullName: b.fullName, specs: b.specs, description: b.description } });
    console.log('Вернул'); return mongoose.disconnect();
  }
  const d = await P.findOne({ brand: 'matkasym-kyzmat', set: 'yntymak-zakup', category: 'Металлический рулон' });
  console.log(d ? `${d.name} → Металлический рулон` : 'карточки нет');
  if (d && process.argv.includes('--apply')) {
    fs.writeFileSync(BACKUP, JSON.stringify({ _id: String(d._id), name: d.name, fullName: d.fullName, specs: d.specs || [], description: d.description || '' }, null, 1));
    await P.updateOne({ _id: d._id }, { $set: {
      name: 'Металлический рулон', fullName: 'Металлический рулон',
      specs: [{ key: 'Ширина рулона', value: '1000 мм, 1250 мм' }, { key: 'Длина', value: 'разная' }],
      description: 'Рулонная сталь шириной 1000 и 1250 мм. Длина рулона бывает разной — уточняйте наличие и цену у менеджера.',
      updatedAt: new Date(),
    } });
    console.log('Записано, бэкап', path.basename(BACKUP));
  }
  await mongoose.disconnect();
})();
