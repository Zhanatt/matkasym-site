/**
 * YNTYMAK ZAKUP: фото карточкам без снимка — стальной лист (все 45 «Лист стальной …»)
 * и картон. Это рендеры в стиле фото труб (товар на белом фоне), собранные из
 * текстур CC0 с Wikimedia Commons (оцинкованная сталь, крафт-картон) —
 * data/renders/gen-sheet-renders.js. Ставим только тем, у кого фото ещё нет.
 *
 *   node scripts/set-yntymak-renders.js          — показать
 *   node scripts/set-yntymak-renders.js --apply  — загрузить в Cloudinary и записать
 *   node scripts/set-yntymak-renders.js --undo   — убрать фото из карточек
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('../lib/cloudinary');

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const BACKUP = path.join(__dirname, 'set-yntymak-renders.backup.json');
const JOBS = [
  { file: 'list-stalnoy.png', publicId: 'matkasym/products/list-stalnoy', filter: { category: 'Металлические листы' } },
  { file: 'karton.png',       publicId: 'matkasym/products/karton',       filter: { category: 'Картон' } },
];

(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (UNDO) {
    const prev = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of prev) await P.updateOne({ _id: new mongoose.Types.ObjectId(d._id) }, { $set: { images: d.images } });
    console.log('Вернул', prev.length);
    return mongoose.disconnect();
  }
  const backup = [];
  for (const job of JOBS) {
    const docs = await P.find({ brand: 'matkasym-kyzmat', set: 'yntymak-zakup', ...job.filter,
      $or: [{ images: { $size: 0 } }, { images: { $exists: false } }] }).project({ name: 1, images: 1 }).toArray();
    console.log(`${job.file}: ${docs.length} карточек`, docs.slice(0, 3).map(d => d.name).join('; '));
    if (!APPLY || !docs.length) continue;
    const up = await cloudinary.uploader.upload(path.join(__dirname, '../data/renders', job.file),
      { public_id: job.publicId, overwrite: true, resource_type: 'image' });
    backup.push(...docs.map(d => ({ _id: String(d._id), images: d.images || [] })));
    await P.updateMany({ _id: { $in: docs.map(d => d._id) } }, { $set: { images: [up.secure_url], updatedAt: new Date() } });
    console.log('  →', up.secure_url);
  }
  if (APPLY) fs.writeFileSync(BACKUP, JSON.stringify(backup, null, 1));
  await mongoose.disconnect();
})();
