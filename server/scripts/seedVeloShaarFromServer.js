/**
 * VELO SHAAR — вторая волна: то, что нашлось на сервере отдела разработки
 * (\\Отдел Разработки\02_Спец_заказ\11_Велостойки и Дизайн\Эмирлан).
 *
 *  • Velopark 2 (СЗ0158) — есть тех.лист и чертёж СБ, на сайте не было
 *  • Стойка для велосипеда Koopsuzbike (СЗ0038.04) — отдельная позиция с рендером
 *  • Koopsuzbike — дописываем конструкторский индекс СЗ0038
 *  • Всем товарам сета проставляем «под заказ» (isOnOrder)
 *
 * Себестоимость взята из «Себестоимость Velopark 2.xlsx» и «Себестоимость 3804.xlsx».
 *
 * Запуск: node server/scripts/seedVeloShaarFromServer.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const cloudinary = require('../lib/cloudinary');

const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const IMAGES_DIR = '/private/tmp/claude-501/-Users-zhanat/0ee3199a-0360-43cb-bb3b-96d6fa56d6b1/scratchpad/velo-server';

const SET_KEY = 'mazza-seyil';   // сет VELO SHAAR упразднён — товары живут в Mazza Seyil

const BASE = {
  brand: 'matkasym-shaar',
  set: SET_KEY,
  price: 0,
  priceUndefined: true,
  priceWholesale: 0,
  priceDealer: 0,
  stock: 0,
  inStock: false,
  stockStatus: 'out_of_stock',
  productStatus: 'for_sale',
  isOnOrder: true,
  isNew: true,
};

const products = [
  {
    name: 'Velopark 2',
    fullName: 'Велопарковка Velopark 2',
    category: 'велопарковка',
    dimensions: '400x63,5x53 см',
    priceCost: 3995.5,
    description:
      'Напольная велопарковка длиной 4 метра на 14 велосипедов. Жёсткая арочная ' +
      'конструкция из профильной трубы, среднее расстояние между фиксаторами ~176 мм — ' +
      'велосипеды стоят, не задевая друг друга рулями. Полимерно-порошковая окраска, ' +
      'устойчивая к коррозии и климату Бишкека. Подходит для образовательных учреждений, ' +
      'бизнес-центров, парков, жилых комплексов и ТРЦ. Срок службы — не менее 5 лет.',
    specs: [
      { key: 'Тип изделия', value: 'напольная велопарковка' },
      { key: 'Количество парковочных мест', value: '14 велосипедов' },
      { key: 'Длина', value: '4000 мм' },
      { key: 'Ширина', value: '635 мм' },
      { key: 'Высота', value: '530 мм' },
      { key: 'Несущий каркас', value: 'стальная профильная труба 40х20х1,5 мм' },
      { key: 'Фиксаторы колеса', value: 'стальная профильная труба 20х20х1,5 мм' },
      { key: 'Расстояние между фиксаторами', value: '~176 мм' },
      { key: 'Покрытие', value: 'полимерно-порошковая окраска, RAL по согласованию' },
      { key: 'Цвет', value: 'чёрный или по желанию клиента' },
      { key: 'Монтаж', value: 'на ровное твёрдое основание (бетон, асфальт)' },
      { key: 'Крепление', value: 'анкерное через монтажные отверстия (анкеры не входят в комплект)' },
      { key: 'Срок службы', value: 'не менее 5 лет' },
      { key: 'Гарантия на покрытие', value: '12 месяцев' },
      { key: 'Конструкторский индекс', value: 'СЗ0158' },
    ],
    images: ['velopark2-02.png', 'velopark2-01.png'],
  },
  {
    name: 'Koopsuzbike Stoika',
    fullName: 'Стойка для велосипеда Koopsuzbike',
    category: 'велостойка',
    priceCost: 719.32,
    description:
      'Одиночная напольная стойка-держатель для велосипеда — та же, что стоит в ' +
      'велостанции Koopsuzbike. Велосипед опирается на П-образную дугу и фиксируется ' +
      'на двух уровнях. Крепится к основанию фланцем на четыре анкера. ' +
      'Ставится поштучно в нужном количестве и с любым шагом.',
    specs: [
      { key: 'Тип', value: 'одиночная напольная велостойка' },
      { key: 'Стойка', value: 'труба Ø32х0,9 мм' },
      { key: 'Дуга держателя', value: 'профильная труба 31х15х0,9 мм' },
      { key: 'Основание', value: 'фланец, лист 1,4 мм' },
      { key: 'Крепление', value: '4 анкера 14/80 (входят в комплект)' },
      { key: 'Покрытие', value: 'порошковая окраска RAL 9005 MAT (чёрный)' },
      { key: 'Масса', value: '1,6 кг' },
      { key: 'Конструкторский индекс', value: 'СЗ0038.04' },
    ],
    images: ['stoika-01.png', 'stoika-02.png'],
  },
];

async function uploadImage(filename) {
  const result = await cloudinary.uploader.upload(path.join(IMAGES_DIR, filename), {
    folder: 'matkasym',
    transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto' }],
  });
  return result.secure_url;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB Atlas');

  for (const p of products) {
    if (await Product.findOne({ fullName: p.fullName })) {
      console.log(`SKIP: ${p.fullName} уже есть`);
      continue;
    }
    const urls = [];
    for (const img of p.images) {
      process.stdout.write(`  ${img} … `);
      urls.push(await uploadImage(img));
      console.log('ok');
    }
    const created = await Product.create({
      ...BASE,
      name: p.name,
      fullName: p.fullName,
      category: p.category,
      dimensions: p.dimensions || '',
      priceCost: p.priceCost || 0,
      description: p.description,
      specs: p.specs,
      images: urls,
    });
    console.log(`CREATED: ${p.name} — ${urls.length} фото (${created._id})`);
  }

  // Konstruktorskiy индекс велостанции — из чертежа СЗ0038.04, где она называется 'KOOPSUZBIKE'
  const station = await Product.findOne({ fullName: 'Велостанция Koopsuzbike' });
  if (station && !station.specs.some(s => s.key === 'Конструкторский индекс')) {
    station.specs.push({ key: 'Конструкторский индекс', value: 'СЗ0038' });
    await station.save();
    console.log('Koopsuzbike: добавлен конструкторский индекс СЗ0038');
  }

  // «Под заказ» для всего сета
  const res = await Product.updateMany({ set: SET_KEY }, { $set: { isOnOrder: true } });
  console.log(`Под заказ: обновлено ${res.modifiedCount} из ${res.matchedCount} товаров сета`);

  console.log('\n=== DONE ===');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
