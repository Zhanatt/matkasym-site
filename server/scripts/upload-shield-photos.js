/**
 * Загрузка фотографий электрощитов в Cloudinary и привязка к товарам
 * Запуск: node scripts/upload-shield-photos.js
 */

const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Конфигурация
const MONGO_URI = require('../lib/atlas');

// Ключи Cloudinary — только из окружения (server/.env), в репозиторий не пишем
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Папка с фотографиями
const PHOTOS_DIR = '/Users/zhanat/Downloads/щиты_каталог/фото_по_категориям';

// Маппинг папок к категориям товаров в базе
const folderToCategory = {
  '001-Коробка_основания': 'Коробка основания',
  '005-Нержавейка_защита_от_дождя': 'Щит из нержавейки',
  '007-Распред_щит_накладной': 'Распред. щит накладной',
  '008-Распред_щит_встраиваемый': 'Распред. щит встраиваемый',
  '009-Шкаф_GGD': 'Напольный шкаф GGD',
  '011-Уличный_шкаф': 'Уличный шкаф',
  '012-Премиум_защита_от_дождя': 'Щит премиум (уличный)',
};

async function uploadPhoto(filePath) {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'matkasym/shields',
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good' }
      ]
    });
    return result.secure_url;
  } catch (err) {
    console.error(`  ✗ Ошибка загрузки ${filePath}:`, err.message);
    return null;
  }
}

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✓ Подключено к MongoDB Atlas\n');

    // Получаем все товары от китайского поставщика
    const products = await Product.find({
      'supplier.company': { $regex: /山东山发电气/ }
    });
    console.log(`Найдено ${products.length} товаров от поставщика\n`);

    // Загружаем фото по категориям
    for (const [folder, categoryName] of Object.entries(folderToCategory)) {
      const folderPath = path.join(PHOTOS_DIR, folder);

      if (!fs.existsSync(folderPath)) {
        console.log(`⏭ Папка не найдена: ${folder}`);
        continue;
      }

      const photos = fs.readdirSync(folderPath)
        .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
        .slice(0, 3); // Берём максимум 3 фото на категорию

      if (photos.length === 0) {
        console.log(`⏭ Нет фото в папке: ${folder}`);
        continue;
      }

      console.log(`\n📁 ${folder} (${photos.length} фото)`);

      // Загружаем фото в Cloudinary
      const uploadedUrls = [];
      for (const photo of photos) {
        const filePath = path.join(folderPath, photo);
        console.log(`  ⬆ Загружаю ${photo}...`);
        const url = await uploadPhoto(filePath);
        if (url) {
          uploadedUrls.push(url);
          console.log(`  ✓ Загружено`);
        }
      }

      if (uploadedUrls.length === 0) continue;

      // Находим товары этой категории и добавляем фото
      const matchingProducts = products.filter(p => p.name.includes(categoryName));
      console.log(`  → Найдено ${matchingProducts.length} товаров категории "${categoryName}"`);

      for (const product of matchingProducts) {
        await Product.findByIdAndUpdate(product._id, {
          $set: { images: uploadedUrls }
        });
        console.log(`  ✓ Обновлён: ${product.name}`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('Готово! Фотографии загружены и привязаны к товарам.');
    console.log('='.repeat(50));

  } catch (err) {
    console.error('Ошибка:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Отключено от MongoDB');
  }
}

main();
