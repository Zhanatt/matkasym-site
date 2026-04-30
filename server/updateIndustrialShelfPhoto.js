require('dotenv').config();
const mongoose   = require('mongoose');
const cloudinary = require('./lib/cloudinary');
const Product    = require('./models/Product');
const path       = require('path');

const MONGO_URI  = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const IMAGE_PATH = path.resolve('/Users/zhanat/Desktop/фото для продакт матрикс/LIGHT.png');

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено\n');

  console.log('📤 Загружаем фото промышленного стеллажа...');
  const result = await cloudinary.uploader.upload(IMAGE_PATH, {
    folder: 'matkasym/shaar',
    public_id: 'industrial-shelf-default',
    overwrite: true,
  });
  const imageUrl = result.secure_url;
  console.log(`✅ ${imageUrl}\n`);

  const products = await Product.find({ category: 'industrial-shelf' });
  console.log(`📦 Найдено промышленных стеллажей: ${products.length}`);

  let updated = 0;
  for (const p of products) {
    if (!p.images || p.images.length === 0) {
      await Product.updateOne({ _id: p._id }, { $set: { images: [imageUrl] } });
      updated++;
      console.log(`  ✅ ${p.fullName || p.name}`);
    } else {
      console.log(`  ⏭  ${p.fullName || p.name} — уже есть фото`);
    }
  }

  console.log(`\n✅ Обновлено: ${updated} из ${products.length}`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
