/**
 * YNTYMAK ZAKUP: ещё два вида металлического листа (27.10.2026) — оцинкованный и
 * нержавеющий. Размеров и цен пока нет: цена не определена, «под заказ».
 * Фото прислал руководитель (data/renders/list-ocinkovannyj.jpg, list-nerzhaveyushchij.jpg).
 *   node scripts/add-galv-stainless-sheets.js [--apply | --undo]
 */
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('../lib/cloudinary');
const TAG = 'sheet-kinds-2026-10-27';
const CARDS = [
  { name: 'Лист оцинкованный', file: 'list-ocinkovannyj.jpg', id: 'matkasym/products/list-ocinkovannyj', kind: 'оцинкованная',
    description: 'Оцинкованный стальной лист российского производства: цинковое покрытие защищает от ржавчины. Размеры и цену уточняйте у менеджера.' },
  { name: 'Лист нержавеющий', file: 'list-nerzhaveyushchij.jpg', id: 'matkasym/products/list-nerzhaveyushchij', kind: 'нержавеющая',
    description: 'Лист из нержавеющей стали российского производства: не ржавеет, подходит для улицы и влажных помещений. Размеры и цену уточняйте у менеджера.' },
];
(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  if (process.argv.includes('--undo')) { console.log('Удалено', (await P.deleteMany({ tags: TAG })).deletedCount); return mongoose.disconnect(); }
  const template = await P.findOne({ brand: 'matkasym-kyzmat', category: 'Металлические листы', name: /х\/к/ });
  for (const c of CARDS) {
    const exists = await P.findOne({ brand: 'matkasym-kyzmat', name: c.name });
    console.log(exists ? `уже есть: ${c.name}` : `завести: ${c.name}`);
    if (exists || !process.argv.includes('--apply')) continue;
    const img = (await cloudinary.uploader.upload(path.join(__dirname, '../data/renders', c.file), { public_id: c.id, overwrite: true })).secure_url;
    const d = { ...template }; delete d._id;
    for (const k of ['driveImages', 'improvementHistory', 'kitParts']) delete d[k];
    const now = new Date();
    await P.insertOne({ ...d, name: c.name, fullName: c.name, sku: '', nomenclature1C: '', images: [img], description: c.description,
      dimensions: '', color: '', specs: [{ key: 'Сталь', value: c.kind }, { key: 'Производство', value: 'Россия' }],
      price: 0, priceUndefined: true, priceCost: 0, priceWholesale: 0, priceDealer: 0,
      stock: 0, inStock: false, stockStatus: 'out_of_stock', isOnOrder: true, isNew: false,
      productStatus: 'for_sale', tags: [TAG], createdAt: now, updatedAt: now });
    console.log('  →', img);
  }
  await mongoose.disconnect();
})();
