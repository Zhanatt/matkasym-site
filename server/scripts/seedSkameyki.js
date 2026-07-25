/**
 * Скрипт импорта 9 скамеек от поставщика Loft Service
 * Сеть: Mazza Seyil, категория: street-bench
 *
 * Запуск: node server/scripts/seedSkameyki.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const cloudinary = require('../lib/cloudinary');

// Atlas URI
const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym';

const Product = require('../models/Product');
const Supplier = require('../models/Supplier');

const IMAGES_DIR = '/Users/zhanat/Downloads/skameyka_images';

const products = [
  {
    name: 'Skameyka Iyilme',
    fullName: 'Skameyka Iyilme C8',
    sku: 'MKS-C8',
    supplierSku: 'С8',
    image: 'C8.jpg',
    dimensions: '180x45x48 см',
    specs: [
      { key: 'Длина', value: '1,8 м (180 см)' },
      { key: 'Глубина (ширина сиденья)', value: '45 см' },
      { key: 'Высота сиденья от земли', value: '45 см' },
      { key: 'Высота конструкции', value: '48 см' },
      { key: 'Толщина планок', value: '3 см' },
      { key: 'Зазор между планками', value: '1 см' },
      { key: 'Радиус изгиба', value: 'около 20 см' },
    ],
    description: 'Скамейка без спинки с изогнутой формой. Деревянные ламели на металлическом каркасе.',
  },
  {
    name: 'Skameyka Kichine',
    fullName: 'Skameyka Kichine C16',
    sku: 'MKS-C16',
    supplierSku: 'С16',
    image: 'C16.jpg',
    dimensions: '120x45x80 см',
    specs: [
      { key: 'Длина', value: '1,2 м (120 см)' },
      { key: 'Глубина (ширина сиденья)', value: '45 см' },
      { key: 'Высота сиденья от земли', value: '45 см' },
      { key: 'Высота спинки', value: '80 см' },
      { key: 'Толщина планок', value: '3 см' },
      { key: 'Зазор между планками', value: '1 см' },
      { key: 'Расстояние между опорами', value: 'около 1 м (100 см)' },
    ],
    description: 'Компактная скамейка со спинкой (120 см). Идеально для небольших зон отдыха.',
  },
  {
    name: 'Skameyka Uzun',
    fullName: 'Skameyka Uzun C26',
    sku: 'MKS-C26',
    supplierSku: 'С26',
    image: 'C26.jpg',
    dimensions: '300x55x85 см',
    specs: [
      { key: 'Длина', value: '3,0 м (300 см)' },
      { key: 'Глубина (ширина сиденья)', value: '55 см' },
      { key: 'Высота сиденья от земли', value: '45 см' },
      { key: 'Высота спинки', value: '85 см' },
      { key: 'Толщина планок', value: '3 см' },
      { key: 'Зазор между планками', value: '1 см' },
      { key: 'Материал', value: 'лиственница / термоясень, влагостойкая обработка' },
      { key: 'Покрытие', value: 'защитное масло с УФ-фильтром' },
      { key: 'Наклон спинки', value: 'около 15°' },
    ],
    description: 'Длинная скамейка со спинкой (3 метра). Древесина лиственницы / термоясеня с влагостойкой обработкой.',
  },
  {
    name: 'Skameyka Kalyn',
    fullName: 'Skameyka Kalyn C34',
    sku: 'MKS-C34',
    supplierSku: 'С34',
    image: 'C34.jpg',
    dimensions: '180x50x85 см',
    specs: [
      { key: 'Длина', value: '1,8 м (180 см)' },
      { key: 'Глубина (ширина сиденья)', value: '50 см' },
      { key: 'Высота сиденья от земли', value: '45 см' },
      { key: 'Высота спинки', value: '85 см' },
      { key: 'Толщина планок', value: '3 см' },
      { key: 'Зазор между планками', value: '1 см' },
      { key: 'Наклон спинки', value: 'около 12°' },
      { key: 'Материал', value: 'древесина лиственницы или дуба, термообработанная' },
      { key: 'Покрытие', value: 'атмосферостойкий лак или масловоск' },
    ],
    description: 'Массивная скамейка со спинкой. Глубокое сиденье (50 см), термообработанная древесина.',
  },
  {
    name: 'Skameyka Dem Aluu',
    fullName: 'Skameyka Dem Aluu C52',
    sku: 'MKS-C52',
    supplierSku: 'С52',
    image: 'C52.jpg',
    dimensions: '180x45x80 см',
    specs: [
      { key: 'Длина', value: '1,8 м (180 см)' },
      { key: 'Глубина', value: '45 см' },
      { key: 'Высота сиденья', value: '45 см' },
      { key: 'Высота спинки', value: '80 см' },
      { key: 'Толщина планок', value: '4 см' },
      { key: 'Зазор между элементами', value: '1 см' },
      { key: 'Материал', value: 'массив дерева (ясень / лиственница)' },
      { key: 'Опора', value: 'металлический каркас с подлокотниками и порошковым покрытием' },
      { key: 'Наклон спинки', value: 'около 12°' },
    ],
    description: 'Скамейка со спинкой и подлокотниками. Массив ясеня / лиственницы на металлическом каркасе.',
  },
  {
    name: 'Skameyka Seylpark',
    fullName: 'Skameyka Seylpark C62',
    sku: 'MKS-C62',
    supplierSku: 'С62',
    image: 'C62.jpg',
    dimensions: '160-180x40-45x80-90 см',
    specs: [
      { key: 'Длина', value: '1,6–1,8 м' },
      { key: 'Высота до спинки', value: '80–90 см' },
      { key: 'Высота сиденья', value: '44–46 см' },
      { key: 'Глубина сиденья', value: '40–45 см' },
      { key: 'Материал ламелей', value: 'дерево (сосна/лиственница), толщина 25–35 мм' },
      { key: 'Каркас', value: 'сталь 6–8 мм, порошковое покрытие' },
      { key: 'Крепёж', value: 'нержавеющая сталь' },
      { key: 'Тип', value: 'парковая скамья со спинкой' },
    ],
    description: 'Парковая скамья со спинкой. Горизонтальные деревянные ламели, стальной каркас с порошковым покрытием.',
  },
  {
    name: 'Skameyka Tegerenek',
    fullName: 'Skameyka Tegerenek C63',
    sku: 'MKS-C63',
    supplierSku: 'С63',
    image: 'C63.jpg',
    dimensions: 'Диаметр 280-320 см, высота стола 74-76 см',
    specs: [
      { key: 'Общий диаметр (со скамейками)', value: '2,8–3,2 м' },
      { key: 'Диаметр центрального стола', value: '1,6–1,8 м' },
      { key: 'Диаметр столешницы', value: '160–180 см' },
      { key: 'Высота стола', value: '74–76 см' },
      { key: 'Высота сиденья', value: '44–46 см' },
      { key: 'Ширина зоны сиденья', value: '38–45 см' },
      { key: 'Разделение на секции', value: '6–8 сегментов' },
      { key: 'Материал', value: 'металл / композит' },
    ],
    description: 'Круглый стол со скамейками (кольцевая система). Вместимость 6–8 человек, секционная конструкция.',
  },
  {
    name: 'Skameyka Salttyk',
    fullName: 'Skameyka Salttyk C74',
    sku: 'MKS-C74',
    supplierSku: 'С74',
    image: 'C74.jpg',
    dimensions: '150-170x40-45x85-90 см',
    specs: [
      { key: 'Высота сиденья', value: '43–45 см' },
      { key: 'Высота спинки', value: '85–90 см' },
      { key: 'Глубина сиденья', value: '42–45 см' },
      { key: 'Длина', value: '150–170 см' },
      { key: 'Ширина сиденья', value: '40–45 см' },
      { key: 'Материал каркаса', value: 'металл, порошковое покрытие' },
      { key: 'Сечение ножек', value: '40×40 мм' },
      { key: 'Материал ламелей', value: 'дерево, толщина 2,5–3 см, ширина 8–10 см' },
      { key: 'Зазор', value: '1–1,5 см' },
    ],
    description: 'Классическая скамейка со спинкой. Металлический каркас с порошковым покрытием, деревянные ламели.',
  },
  {
    name: 'Skameyka Chatyrluu',
    fullName: 'Skameyka Chatyrluu C75',
    sku: 'MKS-C75',
    supplierSku: 'С75',
    image: 'C75.jpg',
    dimensions: '140-160x45-50x190-210 см',
    specs: [
      { key: 'Высота', value: '1,9–2,1 м' },
      { key: 'Длина сиденья', value: '1,4–1,6 м' },
      { key: 'Глубина сиденья', value: '45–50 см' },
      { key: 'Высота сиденья', value: '45 см' },
      { key: 'Крыша', value: 'поликарбонат (тонированный), толщина 6–8 мм' },
      { key: 'Ширина козырька', value: '1,4–1,6 м' },
      { key: 'Вынос вперёд', value: '60–70 см' },
      { key: 'Материал сиденья и спинки', value: 'деревянные ламели, толщина 2,5–3 см' },
      { key: 'Угол наклона спинки', value: '~100–105°' },
    ],
    description: 'Скамейка с навесом/крышей из поликарбоната. Защита от солнца и дождя, деревянные ламели.',
  },
];

async function uploadImage(filename) {
  const filePath = path.join(IMAGES_DIR, filename);
  const result = await cloudinary.uploader.upload(filePath, {
    folder: 'matkasym',
    transformation: [{ width: 1024, height: 1024, crop: 'limit', quality: 'auto' }],
  });
  return result.secure_url;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB Atlas');

  // 1. Create supplier if not exists
  let supplier = await Supplier.findOne({ name: 'Loft Service' });
  if (!supplier) {
    supplier = await Supplier.create({ name: 'Loft Service' });
    console.log('Created supplier: Loft Service');
  } else {
    console.log('Supplier Loft Service already exists');
  }

  const createdIds = [];

  for (const p of products) {
    // Check if already exists
    const existing = await Product.findOne({ sku: p.sku });
    if (existing) {
      console.log(`SKIP: ${p.sku} (${p.name}) already exists`);
      createdIds.push(existing._id);
      continue;
    }

    // Upload image
    console.log(`Uploading image for ${p.sku}...`);
    const imageUrl = await uploadImage(p.image);
    console.log(`  -> ${imageUrl}`);

    // Create product
    const product = await Product.create({
      name: p.name,
      fullName: p.fullName,
      sku: p.sku,
      brand: 'matkasym-shaar',
      set: 'seiyl',
      category: 'street-bench',
      isSupplied: true,
      supplier: {
        company: 'Loft Service',
        sku: p.supplierSku,
      },
      price: 0,
      priceUndefined: true,
      stock: 0,
      dimensions: p.dimensions,
      specs: p.specs,
      description: p.description,
      images: [imageUrl],
      productStatus: 'for_sale',
      isNew: true,
    });

    createdIds.push(product._id);
    console.log(`CREATED: ${p.sku} - ${p.name} (${product._id})`);
  }

  // 2. Link products to supplier
  supplier.products = [...new Set([...supplier.products.map(String), ...createdIds.map(String)])].map(id => new mongoose.Types.ObjectId(id));
  await supplier.save();
  console.log(`\nLinked ${createdIds.length} products to supplier Loft Service`);

  console.log('\n=== DONE ===');
  console.log(`Total: ${createdIds.length} products`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
