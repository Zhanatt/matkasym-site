/**
 * Добавление скамейки Yngai в каталог Mazza Seyil
 * Запуск: node server/scripts/seedYngai.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const cloudinary = require('../lib/cloudinary');

const MONGO_URI = require('../lib/atlas');

const Product = require('../models/Product');

const IMAGE_PATH = '/tmp/yngai_images/img-004.jpg';
const PDF_PATH = '/Users/zhanat/Desktop/Техлисты/Скамейка  _Yngai _ (техлист на удтверждение).pdf';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB Atlas');

  // Check if already exists
  const existing = await Product.findOne({ sku: 'MKS-YNGAI' });
  if (existing) {
    console.log('Product MKS-YNGAI already exists, skipping');
    await mongoose.disconnect();
    return;
  }

  // Upload product image
  console.log('Uploading product image...');
  const imgResult = await cloudinary.uploader.upload(IMAGE_PATH, {
    folder: 'matkasym',
    transformation: [{ width: 1024, height: 1024, crop: 'limit', quality: 'auto' }],
  });
  console.log('Image:', imgResult.secure_url);

  // Upload tech sheet PDF
  console.log('Uploading tech sheet PDF...');
  const pdfResult = await cloudinary.uploader.upload(PDF_PATH, {
    folder: 'matkasym/techsheets',
    resource_type: 'raw',
  });
  console.log('PDF:', pdfResult.secure_url);

  // Create product
  const product = await Product.create({
    name: 'Skameyka Yngai',
    fullName: 'Skameyka Yngai',
    sku: 'MKS-YNGAI',
    brand: 'matkasym-shaar',
    set: 'mazza-seyil',
    category: 'скамейка',
    price: 0,
    priceUndefined: true,
    stock: 0,
    isOnOrder: true,
    inStock: true,
    stockStatus: 'in_stock',
    dimensions: '200x46x85 см',
    specs: [
      { key: 'Длина', value: '2000 мм' },
      { key: 'Ширина', value: '460 мм' },
      { key: 'Высота сиденья', value: '450 мм' },
      { key: 'Общая высота', value: '850 мм' },
      { key: 'Материал каркаса', value: 'Металл' },
      { key: 'Покрытие каркаса', value: 'Порошковая покраска' },
      { key: 'Цвет каркаса', value: 'Тёмно-серый' },
      { key: 'Материал сиденья и спинки', value: 'Деревянные ламели' },
      { key: 'Цвет ламелей', value: 'Тёмно-коричневый' },
      { key: 'Тип установки', value: 'Стационарная (уличная)' },
    ],
    description: 'Скамейка со спинкой и подлокотниками. Металлический каркас с порошковой покраской, деревянные ламели тёмно-коричневого цвета. Стационарная уличная установка.',
    images: [imgResult.secure_url],
    productStatus: 'for_sale',
    isNew: true,
    techSheet: {
      files: [{ name: 'Скамейка Yngai — техлист.pdf', url: pdfResult.secure_url }],
    },
  });

  console.log(`CREATED: ${product.sku} - ${product.name} (${product._id})`);
  console.log('\n=== DONE ===');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
