/**
 * ÖNDÜRÜÜ: две услуги, которых не было на сайте (просил руководитель 26.10.2026) —
 * «Лазерная резка картона» и «Лазерная резка ткани». Одна категория — в PDF они
 * печатаются одним блоком. Цена не указана («по запросу»). Фото картона — рендер
 * matkasym/products/karton; у ткани фото пока нет.
 *
 *   node scripts/add-laser-carton-fabric.js          — показать
 *   node scripts/add-laser-carton-fabric.js --apply  — завести (повторно не дублирует)
 *   node scripts/add-laser-carton-fabric.js --undo   — удалить заведённые
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const TAG = 'laser-carton-fabric-2026-10-26';
const CATEGORY = 'Услуга резки картона и ткани';
const CARDS = [
  { name: 'Лазерная резка картона', material: 'Картон',
    images: ['https://res.cloudinary.com/dnbg21ef8/image/upload/v1793005152/matkasym/products/karton.png'],
    description: 'Режем картон лазером по вашему макету: шаблоны, лекала, упаковка, вырубка деталей и декор. Ровный край без заусенцев, сложный контур — одним проходом.' },
  { name: 'Лазерная резка ткани', material: 'Ткань', images: [],
    description: 'Режем ткань лазером по вашему макету: выкройки, аппликации, нашивки, детали одежды и декора. Лазер оплавляет край — синтетика не сыпется.' },
];

(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (UNDO) {
    const r = await P.deleteMany({ tags: TAG });
    console.log('Удалено', r.deletedCount);
    return mongoose.disconnect();
  }
  const template = await P.findOne({ brand: 'matkasym-kyzmat', set: 'onuguu-set', name: /Laser Art/i });
  if (!template) throw new Error('Нет карточки-образца лазера');
  for (const c of CARDS) {
    const exists = await P.findOne({ brand: 'matkasym-kyzmat', name: c.name });
    console.log(exists ? `уже есть: ${c.name}` : `завести: ${c.name} (${CATEGORY})`);
    if (exists || !APPLY) continue;
    const d = { ...template };
    delete d._id;
    for (const k of ['driveImages', 'improvementHistory', 'kitParts']) delete d[k];
    const now = new Date();
    await P.insertOne({
      ...d,
      name: c.name, fullName: c.name, sku: '', nomenclature1C: '', category: CATEGORY,
      description: c.description, images: c.images, color: '', dimensions: '',
      specs: [
        { key: 'Тип услуги', value: 'Лазерная резка' },
        { key: 'Материал', value: c.material },
        { key: 'Что нужно для заказа', value: 'макет или эскиз' },
      ],
      price: 0, priceUndefined: true, priceCost: 0, priceWholesale: 0, priceDealer: 0,
      stock: 0, inStock: false, stockStatus: 'out_of_stock', isOnOrder: true, isNew: false,
      productStatus: 'for_sale', tags: [TAG], createdAt: now, updatedAt: now,
    });
  }
  if (!APPLY) console.log('Предпросмотр. Записать — --apply');
  await mongoose.disconnect();
})();
