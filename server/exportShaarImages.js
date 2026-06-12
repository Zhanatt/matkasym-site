/**
 * Скрипт выгрузки фото товаров SHAAR для обработки в ChatGPT
 *
 * Выгружает все фото товаров бренда matkasym-shaar в папку output/shaar-images/
 * Формат имени: {category}_{name}_{id}.jpg
 *
 * Запуск: node server/exportShaarImages.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// MongoDB Atlas URI
const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym';

// Output directory
const OUTPUT_DIR = path.join(__dirname, '../output/shaar-images');

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

// Helper: download file
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// Helper: sanitize filename
function sanitize(str) {
  return str
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

async function main() {
  console.log('Подключение к MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Подключено!\n');

  // Создаём папку
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Получаем товары SHAAR с фото
  const products = await Product.find({
    brand: 'matkasym-shaar',
    $or: [
      { images: { $exists: true, $ne: [] } },
      { driveImages: { $exists: true, $ne: [] } }
    ]
  }).lean();

  console.log(`Найдено ${products.length} товаров SHAAR с фото\n`);

  // Создаём manifest для обратной загрузки
  const manifest = [];
  let downloaded = 0;
  let errors = 0;

  for (const product of products) {
    const images = product.images || [];
    const driveImages = product.driveImages || [];

    // Приоритет: images (Cloudinary), потом driveImages (Google Drive)
    let imageUrl = images[0];

    if (!imageUrl && driveImages[0]) {
      // Google Drive direct link
      imageUrl = `https://drive.google.com/uc?export=view&id=${driveImages[0]}`;
    }

    if (!imageUrl) continue;

    const category = sanitize(product.category || 'other');
    const name = sanitize(product.name || 'unnamed');
    const id = product._id.toString();
    const filename = `${category}_${name}_${id}.jpg`;
    const filepath = path.join(OUTPUT_DIR, filename);

    // Пропускаем если уже скачано
    if (fs.existsSync(filepath)) {
      console.log(`⏭️  Уже есть: ${filename}`);
      manifest.push({ id, filename, name: product.name, category: product.category });
      downloaded++;
      continue;
    }

    try {
      console.log(`📥 Скачиваю: ${filename}`);
      await downloadFile(imageUrl, filepath);
      manifest.push({ id, filename, name: product.name, category: product.category });
      downloaded++;
    } catch (err) {
      console.log(`❌ Ошибка: ${filename} - ${err.message}`);
      errors++;
    }
  }

  // Сохраняем manifest
  const manifestPath = path.join(OUTPUT_DIR, '_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Скачано: ${downloaded}`);
  console.log(`❌ Ошибок: ${errors}`);
  console.log(`📁 Папка: ${OUTPUT_DIR}`);
  console.log(`📋 Manifest: ${manifestPath}`);
  console.log('='.repeat(50));

  await mongoose.disconnect();
}

main().catch(console.error);
