/**
 * Фото услуг резки картона и ткани (прислал руководитель 26.10.2026), сжатые до 1400 px:
 * data/renders/lazernaya-rezka-kartona.jpg, lazernaya-rezka-tkani.jpg.
 *   node scripts/set-carton-fabric-photos.js [--apply | --undo]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('../lib/cloudinary');
const BACKUP = path.join(__dirname, 'set-carton-fabric-photos.backup.json');
const JOBS = [
  { name: 'Лазерная резка картона', file: 'lazernaya-rezka-kartona.jpg', id: 'matkasym/products/lazernaya-rezka-kartona' },
  { name: 'Лазерная резка ткани',   file: 'lazernaya-rezka-tkani.jpg',   id: 'matkasym/products/lazernaya-rezka-tkani' },
];
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (process.argv.includes('--undo')) {
    for (const d of JSON.parse(fs.readFileSync(BACKUP, 'utf8'))) await P.updateOne({ name: d.name, brand: 'matkasym-kyzmat' }, { $set: { images: d.images } });
    console.log('Вернул'); return mongoose.disconnect();
  }
  const backup = [];
  for (const j of JOBS) {
    const d = await P.findOne({ brand: 'matkasym-kyzmat', name: j.name });
    console.log(`${j.name}: сейчас ${d?.images?.length || 0} фото`);
    if (!d || !process.argv.includes('--apply')) continue;
    backup.push({ name: j.name, images: d.images || [] });
    const up = await cloudinary.uploader.upload(path.join(__dirname, '../data/renders', j.file), { public_id: j.id, overwrite: true });
    await P.updateOne({ _id: d._id }, { $set: { images: [up.secure_url], updatedAt: new Date() } });
    console.log('  →', up.secure_url);
  }
  if (backup.length) fs.writeFileSync(BACKUP, JSON.stringify(backup, null, 1));
  await mongoose.disconnect();
})();
