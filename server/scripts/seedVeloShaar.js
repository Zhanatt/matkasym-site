/**
 * Сет VELO SHAAR — велопарковки и велостанции MATKASYM SHAAR.
 *
 * Создаёт сет в бренде matkasym-shaar и заводит 4 товара с фотографиями
 * (грузятся в Cloudinary). Повторный запуск ничего не дублирует: сет и товары
 * ищутся по ключу / fullName.
 *
 * Запуск: node server/scripts/seedVeloShaar.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const cloudinary = require('../lib/cloudinary');

const MONGO_URI = require('../lib/atlas');

const Brand = require('../models/Brand');
const Product = require('../models/Product');

const IMAGES_DIR = '/private/tmp/claude-501/-Users-zhanat/0ee3199a-0360-43cb-bb3b-96d6fa56d6b1/scratchpad/velo-shaar';

const BRAND = 'matkasym-shaar';
const SET_KEY = 'mazza-seyil';   // сет VELO SHAAR упразднён — товары живут в Mazza Seyil
const SET_LABEL = 'Mazza Seyil';

const BASE = {
  brand: BRAND,
  set: SET_KEY,
  price: 0,
  priceUndefined: true,
  priceCost: 0,
  priceWholesale: 0,
  priceDealer: 0,
  stock: 0,
  inStock: false,
  stockStatus: 'out_of_stock',
  productStatus: 'for_sale',
  isNew: true,
};

const products = [
  {
    name: 'BP velopark',
    fullName: 'Велопарковка BP velopark',
    category: 'велопарковка',
    description:
      'Модульная велопарковка из профильной трубы с боковыми панелями лазерной резки — ' +
      'силуэт велосипеда. Порошковая покраска (зелёный корпус, серая панель), фирменный ' +
      'шильд MATKASYM Designed By ASAKE. Крепится анкерами к асфальту или бетону. ' +
      'Установлена на АЗС Bishkek Petroleum.',
    specs: [
      { key: 'Тип', value: 'напольная модульная велопарковка' },
      { key: 'Материал', value: 'профильная стальная труба' },
      { key: 'Боковые панели', value: 'сталь, лазерная резка (силуэт велосипеда)' },
      { key: 'Покрытие', value: 'порошковая покраска' },
      { key: 'Цвет', value: 'зелёный корпус + серая панель (RAL по заказу)' },
      { key: 'Крепление', value: 'анкерное, к бетону или асфальту' },
      { key: 'Референс установки', value: 'АЗС Bishkek Petroleum' },
    ],
    images: [
      'bp-01.jpeg', 'bp-02.jpeg', 'bp-03.jpeg', 'bp-04.jpeg',
      'bp-05.jpeg', 'bp-06.jpeg', 'bp-07.jpeg', 'bp-08.jpeg',
    ],
  },
  {
    name: 'Koopsuzbike',
    fullName: 'Велостанция Koopsuzbike',
    category: 'велостанция',
    dimensions: '900x240x250 см',
    description:
      'Крытая велостанция на 20 мест. Навес со светопрозрачным заполнением на стальном ' +
      'каркасе, П-образные держатели велосипедов. В комплекте ремонтная станция со стойкой ' +
      'для подвеса велосипеда и напольный насос. На боковой панели — карта Кыргызстана ' +
      '«MENIN ÜYÜM» для отметки точек, откуда приехали велосипеды.',
    specs: [
      { key: 'Тип', value: 'крытая велостанция с навесом' },
      { key: 'Количество мест', value: '20' },
      { key: 'Длина', value: '900 см' },
      { key: 'Ширина', value: '240 см' },
      { key: 'Высота', value: '250 см' },
      { key: 'Цвет', value: 'RAL 5008 (серо-синий)' },
      { key: 'Материал каркаса', value: 'сталь, порошковая покраска' },
      { key: 'Комплектация', value: 'ремонтная станция + напольный насос' },
      { key: 'Держатели', value: 'П-образные, напольные' },
      { key: 'Панель', value: 'карта Кыргызстана «MENIN ÜYÜM» для отметки точек' },
    ],
    images: [
      'koop-01.jpeg', 'koop-02.jpeg', 'koop-03.jpeg', 'koop-04.jpeg',
      'koop-05.jpeg', 'koop-06.jpeg', 'koop-07.jpeg',
    ],
  },
  {
    name: 'ELESEPED',
    fullName: 'Велопарковка ELESEPED',
    category: 'велопарковка',
    description:
      'Рядная напольная велопарковка: арочные держатели на общем основании из профильной ' +
      'трубы. Велосипед фиксируется за переднее колесо. Порошковая покраска, крепление ' +
      'анкерами через отверстия в основании.',
    specs: [
      { key: 'Тип', value: 'рядная напольная велопарковка' },
      { key: 'Держатели', value: 'арочные, за переднее колесо' },
      { key: 'Материал', value: 'профильная стальная труба' },
      { key: 'Покрытие', value: 'порошковая покраска' },
      { key: 'Крепление', value: 'анкерное, через отверстия в основании' },
    ],
    images: ['eleseped-01.png'],
  },
  {
    name: 'Velopark 8',
    fullName: 'Велопарковка Velopark 8',
    category: 'велопарковка',
    description:
      'Арочная велопарковка на 8 мест: сваренные в единый блок арки на раме-основании, ' +
      'двусторонняя постановка велосипедов. Порошковая покраска в тёмно-серый. ' +
      'Готовое изделие, не требует сборки на объекте.',
    specs: [
      { key: 'Тип', value: 'арочная велопарковка, двусторонняя' },
      { key: 'Количество мест', value: '8' },
      { key: 'Материал', value: 'профильная стальная труба' },
      { key: 'Покрытие', value: 'порошковая покраска' },
      { key: 'Цвет', value: 'тёмно-серый (антрацит)' },
      { key: 'Конструкция', value: 'цельносварная, на раме-основании' },
    ],
    images: ['velopark8-01.png', 'velopark8-02.jpeg'],
  },
];

async function uploadImage(filename) {
  const result = await cloudinary.uploader.upload(path.join(IMAGES_DIR, filename), {
    folder: 'matkasym',
    transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto' }],
  });
  return result.secure_url;
}

async function ensureSet() {
  let brand = await Brand.findOne({ key: BRAND });
  if (!brand) throw new Error(`Бренд ${BRAND} не найден`);
  if (brand.sets.some(s => s.key === SET_KEY)) {
    console.log(`Сет ${SET_KEY} уже есть в ${BRAND}`);
    return;
  }
  const order = Math.max(0, ...brand.sets.map(s => s.order || 0)) + 1;
  brand.sets.push({ key: SET_KEY, label: SET_LABEL, labelRu: 'Велопарковки', order });
  await brand.save();
  console.log(`Создан сет ${SET_KEY} «${SET_LABEL}» (order ${order}) в ${BRAND}`);
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB Atlas');

  await ensureSet();

  for (const p of products) {
    const existing = await Product.findOne({ fullName: p.fullName });
    if (existing) {
      console.log(`SKIP: ${p.fullName} уже есть (${existing._id})`);
      continue;
    }

    const urls = [];
    for (const img of p.images) {
      process.stdout.write(`  ${img} … `);
      urls.push(await uploadImage(img));
      console.log('ok');
    }

    const product = await Product.create({
      ...BASE,
      name: p.name,
      fullName: p.fullName,
      category: p.category,
      dimensions: p.dimensions || '',
      description: p.description,
      specs: p.specs,
      images: urls,
    });
    console.log(`CREATED: ${p.name} — ${urls.length} фото (${product._id})`);
  }

  console.log('\n=== DONE ===');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
