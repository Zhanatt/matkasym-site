/**
 * Скрипт загрузки lifestyle-фото обратно в базу
 *
 * Берёт обработанные фото из папки output/shaar-lifestyle/
 * Загружает в Cloudinary и добавляет к товару
 *
 * Запуск: node server/importLifestyleImages.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const cloudinary = require('./lib/cloudinary');

// MongoDB Atlas URI
const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym';

// Input directory (готовые фото после ChatGPT)
const INPUT_DIR = path.join(__dirname, '../output/shaar-lifestyle');
const MANIFEST_PATH = path.join(__dirname, '../output/shaar-images/_manifest.json');

// Product model
const productSchema = new mongoose.Schema({
  name: String,
  fullName: String,
  brand: String,
  category: String,
  images: [String],
  driveImages: [String],
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

async function main() {
  // Проверяем наличие папки
  if (!fs.existsSync(INPUT_DIR)) {
    console.log(`❌ Папка не найдена: ${INPUT_DIR}`);
    console.log('\n📋 Инструкция:');
    console.log('1. Обработай фото из output/shaar-images/ в ChatGPT');
    console.log('2. Сохрани результаты в output/shaar-lifestyle/');
    console.log('3. Имена файлов должны совпадать с оригиналами');
    console.log('4. Запусти этот скрипт снова');
    return;
  }

  // Загружаем manifest
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log(`❌ Manifest не найден: ${MANIFEST_PATH}`);
    console.log('Сначала запусти exportShaarImages.js');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const manifestMap = {};
  manifest.forEach(m => { manifestMap[m.filename] = m; });

  console.log('Подключение к MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Подключено!\n');

  // Получаем список готовых файлов
  const files = fs.readdirSync(INPUT_DIR).filter(f =>
    f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.webp')
  );

  console.log(`Найдено ${files.length} готовых фото\n`);

  let uploaded = 0;
  let errors = 0;

  for (const filename of files) {
    // Ищем в manifest по имени (может отличаться расширение)
    const baseName = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    const manifestEntry = Object.values(manifestMap).find(m =>
      m.filename.replace(/\.(jpg|jpeg|png|webp)$/i, '') === baseName
    );

    if (!manifestEntry) {
      console.log(`⚠️  Не найден в manifest: ${filename}`);
      continue;
    }

    const productId = manifestEntry.id;
    const filepath = path.join(INPUT_DIR, filename);

    try {
      console.log(`📤 Загружаю: ${filename}`);

      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(filepath, {
        folder: 'matkasym-shaar-lifestyle',
        public_id: `lifestyle_${productId}`,
        overwrite: true,
      });

      // Update product - добавляем lifestyle фото вторым в массив
      const product = await Product.findById(productId);
      if (product) {
        // Добавляем lifestyle URL если его ещё нет
        if (!product.images.includes(result.secure_url)) {
          // Вставляем вторым (после основного фото)
          product.images.splice(1, 0, result.secure_url);
          await product.save();
          console.log(`✅ Добавлено к товару: ${product.name}`);
        } else {
          console.log(`⏭️  Уже есть в товаре: ${product.name}`);
        }
        uploaded++;
      } else {
        console.log(`❌ Товар не найден: ${productId}`);
        errors++;
      }
    } catch (err) {
      console.log(`❌ Ошибка: ${filename} - ${err.message}`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Загружено: ${uploaded}`);
  console.log(`❌ Ошибок: ${errors}`);
  console.log('='.repeat(50));

  await mongoose.disconnect();
}

main().catch(console.error);
