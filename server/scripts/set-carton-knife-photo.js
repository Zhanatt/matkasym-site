/**
 * «Резка картона» (ÖNDÜRÜÜ): фото резки ножом на плоттере вместо лазерной головки
 * (прислал руководитель 27.10.2026). data/renders/rezka-kartona-nozhom.jpg, 1400 px.
 *   node scripts/set-carton-knife-photo.js [--apply | --undo]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('../lib/cloudinary');
const BACKUP = path.join(__dirname, 'set-carton-knife-photo.backup.json');
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  const d = await P.findOne({ brand: 'matkasym-kyzmat', name: 'Резка картона' });
  if (process.argv.includes('--undo')) {
    await P.updateOne({ _id: d._id }, { $set: { images: JSON.parse(fs.readFileSync(BACKUP, 'utf8')).images } });
    console.log('Вернул'); return mongoose.disconnect();
  }
  console.log(`${d.name}: сейчас ${d.images?.length || 0} фото`);
  if (process.argv.includes('--apply')) {
    fs.writeFileSync(BACKUP, JSON.stringify({ images: d.images || [] }, null, 1));
    const up = await cloudinary.uploader.upload(path.join(__dirname, '../data/renders/rezka-kartona-nozhom.jpg'),
      { public_id: 'matkasym/products/rezka-kartona-nozhom', overwrite: true });
    await P.updateOne({ _id: d._id }, { $set: { images: [up.secure_url], updatedAt: new Date() } });
    console.log('→', up.secure_url);
  }
  await mongoose.disconnect();
})();
