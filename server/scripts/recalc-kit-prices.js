// Пересчитывает цены и остаток у зависимых комплектов по их деталям.
// Запуск: node scripts/recalc-kit-prices.js [--apply]
// Без --apply только показывает, что изменится.
//
// Зачем: комплекты заводили до того, как цена стала считаться по составу, и в
// базе у них лежит цифра, проставленная руками, — обычно цена одной детали.
// Карточка показывает сумму сразу, а каталог, PDF и посты берут её из базы.

const fs       = require('fs');
const path     = require('path');
const mongoose = require('mongoose');
const Product  = require('../models/Product');
const { kitPricesFromParts, kitStockFromParts, partIdOf, PRICE_FIELDS } = require('../lib/kits');
const { BASE_KEYS } = require('../lib/stockBases');

const MONGO_URI = process.env.MONGO_URI || require('../lib/atlas');

const LABEL = { price: 'розница', priceWholesale: 'опт', priceDealer: 'дилерская' };

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(MONGO_URI);

  const kits = await Product.find({ isKit: true, kitType: { $ne: 'independent' }, 'kitParts.0': { $exists: true } }).lean();
  console.log(`Зависимых комплектов с деталями: ${kits.length}\n`);

  const partIds = [...new Set(kits.flatMap(k => (k.kitParts || []).map(partIdOf)))].filter(Boolean);
  const parts   = await Product.find({ _id: { $in: partIds } }, ['_id', 'stockByBase', 'stock', ...PRICE_FIELDS].join(' ')).lean();
  const partById = new Map(parts.map(p => [String(p._id), p]));

  const planned = [];
  for (const kit of kits) {
    const prices = kitPricesFromParts(kit.kitParts, partById);
    if (!prices) { console.log(`⚠️  ${kit.fullName || kit.name}: деталь потеряна — пропускаем`); continue; }

    // Нулевую сумму не пишем: у детали прайс заполнен не всегда, и пустой
    // прайс деталей затёр бы живую цену на сайте.
    const $set = {};
    const notes = [];
    for (const field of PRICE_FIELDS) {
      if (prices[field] > 0 && prices[field] !== (kit[field] || 0)) {
        $set[field] = prices[field];
        notes.push(`${LABEL[field]} ${(kit[field] || 0).toLocaleString('ru')} → ${prices[field].toLocaleString('ru')}`);
      }
    }

    const calc = kitStockFromParts(kit.kitParts, partById);
    if (calc && calc.stock !== (kit.stock || 0)) {
      Object.assign($set, {
        stock: calc.stock,
        inStock: calc.stock > 0,
        stockStatus: calc.stock > 0 ? 'in_stock' : 'out_of_stock',
        ...Object.fromEntries(BASE_KEYS.map(b => [`stockByBase.${b}`, calc.byBase[b]])),
      });
      notes.push(`остаток ${kit.stock || 0} → ${calc.stock}`);
    }

    if (!notes.length) { console.log(`=  ${kit.fullName || kit.name}: уже сходится`); continue; }
    planned.push({ kit, $set });
    console.log(`${apply ? '✔' : '→'}  ${kit.fullName || kit.name}: ${notes.join(', ')}`);
  }

  if (apply && planned.length) {
    // Бэкап до записи: откатывать уже приходилось.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file  = path.join(__dirname, `backup-kit-prices-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(planned.map(({ kit }) => ({
      _id: String(kit._id), name: kit.fullName || kit.name,
      ...Object.fromEntries(PRICE_FIELDS.map(f => [f, kit[f]])),
      stock: kit.stock, inStock: kit.inStock, stockStatus: kit.stockStatus, stockByBase: kit.stockByBase,
    })), null, 2));
    console.log(`\nБэкап прежних значений: ${file}`);

    for (const { kit, $set } of planned) await Product.updateOne({ _id: kit._id }, { $set });
    console.log(`Записано комплектов: ${planned.length}`);
  }

  await mongoose.disconnect();
  if (!apply) console.log(`\nЭто предпросмотр (изменится ${planned.length}). Запусти с --apply чтобы записать.`);
}

main().catch(e => { console.error(e); process.exit(1); });
