/**
 * YNTYMAK ZAKUP: «Картон (пример)» → настоящая карточка (26.10.2026):
 * картон гофрированный 5-слойный, один формат 2000×1480 мм, цена не определена,
 * фото — прислал руководитель (data/renders/karton-gofro-5sl.jpg, сжато до 1400 px).
 *   node scripts/set-carton-card.js [--apply | --undo]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('../lib/cloudinary');
const BACKUP = path.join(__dirname, 'set-carton-card.backup.json');
const NAME = 'Картон гофрированный 5-слойный';
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (process.argv.includes('--undo')) {
    const b = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    await P.updateOne({ _id: new mongoose.Types.ObjectId(b._id) }, { $set: { name: b.name, fullName: b.fullName, specs: b.specs, description: b.description, images: b.images, dimensions: b.dimensions } });
    console.log('Вернул'); return mongoose.disconnect();
  }
  const d = await P.findOne({ brand: 'matkasym-kyzmat', set: 'yntymak-zakup', category: 'Картон' });
  console.log(d ? `${d.name} → ${NAME}` : 'карточки нет');
  if (d && process.argv.includes('--apply')) {
    fs.writeFileSync(BACKUP, JSON.stringify({ _id: String(d._id), name: d.name, fullName: d.fullName, specs: d.specs || [], description: d.description || '', images: d.images || [], dimensions: d.dimensions || '' }, null, 1));
    const up = await cloudinary.uploader.upload(path.join(__dirname, '../data/renders/karton-gofro-5sl.jpg'), { public_id: 'matkasym/products/karton-gofro-5sl', overwrite: true });
    await P.updateOne({ _id: d._id }, { $set: {
      name: NAME, fullName: NAME, images: [up.secure_url], dimensions: '',
      specs: [{ key: 'Формат листа', value: '2000×1480 мм' }, { key: 'Слойность', value: '5 слоёв' }],
      description: 'Гофрированный картон, 5 слоёв, лист 2000×1480 мм. Цену уточняйте у менеджера.',
      updatedAt: new Date(),
    } });
    console.log('Записано:', up.secure_url);
  }
  await mongoose.disconnect();
})();
