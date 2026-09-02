/**
 * Детали зависимых комплектов — вон из каталога.
 *
 * Запуск из папки server:
 *   node scripts/hide-kit-parts.js            — показать, что изменится
 *   node scripts/hide-kit-parts.js --apply    — записать
 *
 * Комплекты собирали скриптами, и статус деталей никто не менял: ножки ANTILOP
 * и столешницы LINNMON висят в каталоге отдельными карточками рядом с готовым
 * изделием. Деталь зависимого комплекта продаётся только внутри него, поэтому
 * получает статус kit_part и пропадает из каталога, PDF и постов.
 *
 * Независимые комплекты (SKÅDIS, BOAXEL) не трогаем: там детали и есть товар.
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');
const { partIdOf, PART_STATUS } = require('../lib/kits');

const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(MONGO_URI);

  const kits = await Product.find({ isKit: true, kitType: { $ne: 'independent' } })
    .populate('kitParts.product', 'name sku productStatus')
    .lean();

  const toHide = new Map();   // id детали → { name, sku, kits: [] }
  for (const kit of kits) {
    for (const part of kit.kitParts || []) {
      const info = part.product;
      if (!info || info.productStatus === PART_STATUS) continue;
      const id = partIdOf(part);
      if (!toHide.has(id)) toHide.set(id, { name: info.name, sku: info.sku || '', kits: [] });
      toHide.get(id).kits.push(kit.name);
    }
  }

  console.log(`зависимых комплектов: ${kits.length}`);
  console.log(`деталей спрятать: ${toHide.size}`);
  for (const [, info] of toHide) {
    console.log(`   ${info.name.slice(0, 52).padEnd(54)} ${info.sku.padEnd(18)} ← ${info.kits[0]}`);
  }

  if (!APPLY) { console.log('\nПредпросмотр. Запусти с --apply.'); await mongoose.disconnect(); return; }
  if (!toHide.size) { console.log('\nНечего менять.'); await mongoose.disconnect(); return; }

  const r = await Product.updateMany(
    { _id: { $in: [...toHide.keys()] } },
    { $set: { productStatus: PART_STATUS } },
  );
  console.log(`\n✔ спрятано: ${r.modifiedCount}`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
