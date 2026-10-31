// Фонарь Skeit Park в сет MAZZA SEYIL (31.10.2026, данные от пользователя):
// высота 8 м, металл 5 мм, цвет антрацит, 70 000 сом за штуку.
// Карточка как у Nurjol Standart: категория «Остальное освещение», лист «Освещение MAZZA SEYIL» в PDF.
//
//   node scripts/add-skeit-park-lamp.js <фото.jpg>           — предпросмотр
//   node scripts/add-skeit-park-lamp.js <фото.jpg> --apply   — залить фото и создать карточку
//   node scripts/add-skeit-park-lamp.js --undo               — удалить карточку (фото в Cloudinary остаётся)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const SKU = 'MKS-MS-017';
const DOC = {
  name: 'Skeit Park', fullName: 'Skeit Park', sku: SKU,
  brand: 'matkasym-shaar', set: 'mazza-seyil', category: 'Остальное освещение',
  price: 70000, priceUndefined: false, unit: 'шт',
  dimensions: 'Высота-8метр',
  specs: [
    { key: 'Высота', value: '8 м' },
    { key: 'Толщина металла', value: '5 мм' },
    { key: 'Цвет', value: 'антрацит' },
  ],
  description: 'Уличный фонарь для скейт-парков и спортивных площадок: консоль со светильником и треугольная панель с силуэтом скейтбордиста, вырезанным лазером.',
  productStatus: 'for_sale', isCustomOrder: true, isOnOrder: true, isSupplied: false,
  maker: 'matkasym', pdfPage: 'Освещение MAZZA SEYIL',
};

(async () => {
  await mongoose.connect(MONGO_URI);
  const exists = await Product.findOne({ sku: SKU }).lean();
  if (process.argv.includes('--undo')) {
    if (!exists) { console.log('Карточки нет'); process.exit(0); }
    await Product.collection.deleteOne({ _id: exists._id });
    console.log('Удалена', SKU); process.exit(0);
  }
  if (exists) { console.log('Уже есть:', SKU, String(exists._id)); process.exit(0); }
  const photo = process.argv[2];
  if (!photo || photo.startsWith('--')) { console.error('Укажите фото'); process.exit(1); }
  console.log('Будет создано:', JSON.stringify(DOC, null, 1), '\nФото:', photo);
  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запуск с --apply создаст карточку.'); process.exit(0); }

  const cloudinary = require('../lib/cloudinary');
  const up = await cloudinary.uploader.upload(photo, { public_id: 'matkasym/shaar/skeit-park', overwrite: true });
  const p = await Product.create({ ...DOC, images: [up.secure_url] });
  // createdAt — вручную через collection: Product.updateOne при timestamps его выбрасывает (CLAUDE.md)
  await Product.collection.updateOne({ _id: p._id }, { $set: { createdAt: new Date(), updatedAt: new Date() } });
  console.log('Создана карточка', SKU, String(p._id), up.secure_url);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
