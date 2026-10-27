/**
 * 27.10.2026, по слову руководителя:
 *  · резка ткани и картона делается НОЖОМ (режущий плоттер), не лазером — названия,
 *    характеристики и описания карточек ÖNDÜRÜÜ;
 *  · новое фото у резки ткани (data/renders/rezka-tkani-nozhom.jpg);
 *  · новое фото лазерной резки металла (data/renders/lazernaya-rezka-metalla.jpg) —
 *    первым в карточку Laser Art 0,5-3мм: обложка группы на сайте и в PDF — самое новое фото.
 *   node scripts/knife-cutting-and-laser-photo.js [--apply | --undo]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('../lib/cloudinary');
const BACKUP = path.join(__dirname, 'knife-cutting-and-laser-photo.backup.json');
const up = (file, id) => cloudinary.uploader.upload(path.join(__dirname, '../data/renders', file), { public_id: id, overwrite: true }).then(r => r.secure_url);
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (process.argv.includes('--undo')) {
    for (const b of JSON.parse(fs.readFileSync(BACKUP, 'utf8'))) {
      await P.updateOne({ _id: new mongoose.Types.ObjectId(b._id) }, { $set: { name: b.name, fullName: b.fullName, specs: b.specs, description: b.description, images: b.images } });
    }
    console.log('Вернул'); return mongoose.disconnect();
  }
  const fabric = await P.findOne({ brand: 'matkasym-kyzmat', name: 'Лазерная резка ткани' });
  const carton = await P.findOne({ brand: 'matkasym-kyzmat', name: 'Лазерная резка картона' });
  const laser = await P.findOne({ brand: 'matkasym-kyzmat', set: 'onuguu-set', name: /Laser Art 0,5-3/ });
  console.log({ fabric: !!fabric, carton: !!carton, laser: laser?.name });
  if (!process.argv.includes('--apply')) return mongoose.disconnect();
  fs.writeFileSync(BACKUP, JSON.stringify([fabric, carton, laser].filter(Boolean).map(d => ({
    _id: String(d._id), name: d.name, fullName: d.fullName, specs: d.specs || [], description: d.description || '', images: d.images || [] })), null, 1));
  const spec = (m) => [{ key: 'Тип услуги', value: 'Резка ножом (режущий плоттер)' }, { key: 'Материал', value: m }, { key: 'Что нужно для заказа', value: 'макет или эскиз' }];
  if (fabric) {
    const img = await up('rezka-tkani-nozhom.jpg', 'matkasym/products/rezka-tkani-nozhom');
    await P.updateOne({ _id: fabric._id }, { $set: { name: 'Резка ткани', fullName: 'Резка ткани', specs: spec('Ткань'), images: [img], updatedAt: new Date(),
      description: 'Режем ткань ножом на режущем плоттере по вашему макету: выкройки, аппликации, нашивки, детали одежды и декора. Точный крой, ровный край без подпалин.' } });
    console.log('ткань:', img);
  }
  if (carton) {
    await P.updateOne({ _id: carton._id }, { $set: { name: 'Резка картона', fullName: 'Резка картона', specs: spec('Картон'), updatedAt: new Date(),
      description: 'Режем картон ножом на режущем плоттере по вашему макету: шаблоны, лекала, упаковка, детали и декор. Ровный край без подпалин, сложный контур — за один проход.' } });
    console.log('картон: переименован');
  }
  if (laser) {
    const img = await up('lazernaya-rezka-metalla.jpg', 'matkasym/products/lazernaya-rezka-metalla');
    await P.updateOne({ _id: laser._id }, { $set: { images: [img, ...(laser.images || []).filter(u => u !== img)], updatedAt: new Date() } });
    console.log('лазер:', img);
  }
  await mongoose.disconnect();
})();
