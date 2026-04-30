/**
 * Загружает фото шита на Cloudinary и ставит его всем ЩР товарам
 * Запуск: node updatePanelPhoto.js
 */
require('dotenv').config();
const mongoose  = require('mongoose');
const cloudinary = require('./lib/cloudinary');
const Product   = require('./models/Product');
const path      = require('path');

const MONGO_URI  = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const IMAGE_PATH = path.resolve('/Users/zhanat/Desktop/фото для продакт матрикс/шит.png');

const PANEL_CATEGORIES = [
  'electric-panel-outdoor',
  'electric-panel-mount',
  'electric-panel-gas',
  'electric-panel-floor',
  'electric-panel-plumbing',
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB Atlas\n');

  // 1. Загружаем фото на Cloudinary
  console.log('📤 Загружаем фото на Cloudinary...');
  const result = await cloudinary.uploader.upload(IMAGE_PATH, {
    folder: 'matkasym/shaar',
    public_id: 'electric-panel-default',
    overwrite: true,
  });
  const imageUrl = result.secure_url;
  console.log(`✅ Фото загружено: ${imageUrl}\n`);

  // 2. Обновляем все ЩР товары — ставим это фото первым (если нет фото)
  //    Или добавляем, если список пустой
  const products = await Product.find({
    brand: 'matkasym-shaar',
    category: { $in: PANEL_CATEGORIES },
  });

  console.log(`📦 Найдено ЩР товаров: ${products.length}`);
  let updated = 0;

  for (const p of products) {
    // Ставим фото только если нет своих изображений
    if (!p.images || p.images.length === 0) {
      await Product.updateOne({ _id: p._id }, { $set: { images: [imageUrl] } });
      updated++;
      console.log(`  ✅ ${p.fullName || p.name}`);
    } else {
      console.log(`  ⏭  ${p.fullName || p.name} — уже есть фото, пропускаем`);
    }
  }

  console.log(`\n✅ Обновлено: ${updated} из ${products.length}`);
  await mongoose.disconnect();
  console.log('✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
