/**
 * Чертёж/рендер изделия с сервера отдела разработки — первым фото в карточке.
 *
 * План готовится отдельно (картинки вырезаны из СБ-чертежей) и лежит в JSON:
 *   [{ du, image: <локальный jpg>, publicId, products: [id] }]
 *
 *   node scripts/set-drawing-first-photo.js <plan.json>           — показать, что изменится
 *   node scripts/set-drawing-first-photo.js <plan.json> --apply   — загрузить в Cloudinary и поставить первым
 *
 * Остальные фото карточки не трогаем — чертёж встаёт в начало галереи.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('../lib/cloudinary');

const planPath = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!planPath) { console.error('node scripts/set-drawing-first-photo.js <plan.json> [--apply]'); process.exit(1); }

(async () => {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('products');
  const ids = [...new Set(plan.flatMap(e => e.products))].map(id => new mongoose.Types.ObjectId(id));
  const products = await col.find({ _id: { $in: ids } }, { projection: { name: 1, images: 1 } }).toArray();
  const byId = new Map(products.map(p => [String(p._id), p]));

  const empty = products.filter(p => !(p.images || []).length).length;
  console.log(`чертежей: ${plan.length}, карточек: ${products.length} (из них без фото: ${empty})`);
  for (const e of plan) console.log(`  ${e.du.padEnd(16)} → ${e.products.map(id => byId.get(id)?.name || '?').join(' | ').slice(0, 110)}`);

  if (!APPLY) { console.log('\nПредпросмотр. Запусти с --apply.'); await mongoose.disconnect(); return; }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const backup = path.join(__dirname, `backup-photo-order-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(products.map(p => ({ _id: String(p._id), name: p.name, images: p.images || [] })), null, 1));
  console.log(`\nпрежние фото сохранены: ${path.basename(backup)}`);

  let n = 0;
  for (const e of plan) {
    const up = await cloudinary.uploader.upload(e.image, {
      folder: 'matkasym/shaar', public_id: e.publicId, overwrite: true, resource_type: 'image',
    });
    const url = up.secure_url;
    for (const id of e.products) {
      const p = byId.get(id); if (!p) continue;
      const rest = (p.images || []).filter(u => !u.includes(`/matkasym/shaar/${e.publicId}.`));
      await col.updateOne({ _id: p._id }, { $set: { images: [url, ...rest], updatedAt: new Date() } });
      n++;
    }
    console.log(`  ✔ ${e.du} — ${url}`);
  }
  console.log(`\nготово: чертёж первым у ${n} карточек`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
