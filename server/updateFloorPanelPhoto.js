require('dotenv').config();
const mongoose   = require('mongoose');
const cloudinary = require('./lib/cloudinary');
const Product    = require('./models/Product');
const path       = require('path');

const MONGO_URI  = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const IMAGE_PATH = path.resolve('/Users/zhanat/Desktop/фото для продакт матрикс/ЩЭ.png');

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено\n');

  console.log('📤 Загружаем ЩЭ фото...');
  const result = await cloudinary.uploader.upload(IMAGE_PATH, {
    folder: 'matkasym/shaar',
    public_id: 'electric-panel-floor-default',
    overwrite: true,
  });
  const imageUrl = result.secure_url;
  console.log(`✅ ${imageUrl}\n`);

  const res = await Product.updateMany(
    { brand: 'matkasym-shaar', category: 'electric-panel-floor' },
    { $set: { images: [imageUrl] } }
  );
  console.log(`✅ Обновлено ЩЭ товаров: ${res.modifiedCount}`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
