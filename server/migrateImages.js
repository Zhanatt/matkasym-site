/**
 * Миграция фото с imgbb → Cloudinary
 * Запустить: node migrateImages.js
 */
require('dotenv').config();
const mongoose  = require('mongoose');
const cloudinary = require('./lib/cloudinary');
const Product   = require('./models/Product');

const MONGO_URI = process.env.MONGO_URI;

async function uploadToCloudinary(url) {
  const result = await cloudinary.uploader.upload(url, {
    folder: 'matkasym',
    fetch_format: 'auto',
    quality:  'auto',
  });
  return result.secure_url;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB подключён');

  const products = await Product.find({});
  console.log(`Найдено товаров: ${products.length}`);

  let updated = 0;
  let skipped = 0;
  let errors  = 0;

  for (const product of products) {
    const newImages = [];
    let changed = false;

    for (const imgUrl of product.images) {
      if (!imgUrl.includes('ibb.co') && !imgUrl.includes('imgbb.com')) {
        newImages.push(imgUrl); // уже не imgbb
        continue;
      }

      try {
        console.log(`  ↑ Загружаю: ${imgUrl.slice(0, 80)}...`);
        const newUrl = await uploadToCloudinary(imgUrl);
        newImages.push(newUrl);
        console.log(`  ✓ → ${newUrl.slice(0, 80)}`);
        changed = true;
      } catch (e) {
        console.error(`  ✗ Ошибка для ${imgUrl}: ${e.message}`);
        newImages.push(imgUrl); // оставляем старую
        errors++;
      }
    }

    if (changed) {
      product.images = newImages;
      await product.save();
      updated++;
      console.log(`[${updated}] Обновлён: ${product.name}`);
    } else {
      skipped++;
    }
  }

  console.log('\n=== Готово ===');
  console.log(`Обновлено товаров: ${updated}`);
  console.log(`Пропущено (уже Cloudinary): ${skipped}`);
  console.log(`Ошибок: ${errors}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
