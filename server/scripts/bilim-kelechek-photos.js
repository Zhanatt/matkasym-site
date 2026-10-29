// Фото сета «Билим келечек» для каталога (29.10.2026).
//
// Всё кладём в Cloudinary matkasym/bilim-kelechek/<имя>, PDF берёт фото оттуда.
// ALA-TOO и «Стол I 1 R модель - 01» получают новое главное фото (старые остаются
// следом). Треугольные парты на сайте не заведены — их фото только для PDF.
//
//   node scripts/bilim-kelechek-photos.js <папка с jpg>          — предпросмотр
//   node scripts/bilim-kelechek-photos.js <папка с jpg> --apply  — записать

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('../lib/cloudinary');

const DIR = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!DIR || !fs.existsSync(DIR)) { console.error('Укажите папку'); process.exit(1); }

const MAIN = {                       // файл → карточка, которой он станет главным фото
  'ala-too': { name: 'ALA-TOO парта, стул' },
  'i1r-01': { sku: 'MKS-BK-004' },
};

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('products');
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.jpg'));
  const docs = {};
  for (const [id, q] of Object.entries(MAIN)) {
    docs[id] = await col.findOne({ ...q, set: 'bilim-kelechek' });
    if (!docs[id]) throw new Error('нет товара ' + JSON.stringify(q));
    console.log(id, '→', docs[id].name);
  }
  console.log(files.join(', '));
  if (!APPLY) { console.log('\nПредпросмотр. Для записи добавьте --apply'); process.exit(0); }

  const bfile = path.join(__dirname, `backup-bilim-kelechek-photos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(bfile, JSON.stringify(Object.values(docs), null, 1));
  console.log('Бэкап:', bfile);

  for (const f of files) {
    const id = f.replace('.jpg', '');
    const up = await cloudinary.uploader.upload(path.join(DIR, f),
      { public_id: `matkasym/bilim-kelechek/${id}`, overwrite: true, invalidate: true });
    console.log('↑', id);
    const doc = docs[id];
    if (!doc) continue;
    const old = (doc.images || []).filter(u => !u.includes('/matkasym/bilim-kelechek/'));
    await col.updateOne({ _id: doc._id }, { $set: { images: [up.secure_url, ...old] } });
    console.log('✓', doc.name);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
