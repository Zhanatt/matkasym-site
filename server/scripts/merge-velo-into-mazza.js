/**
 * Сет «VELO SHAAR» упраздняется: велопарковки и велостойки переезжают в «Mazza Seyil».
 *
 * Отдельным сетом шесть позиций не живут: это уличное благоустройство, ровно то же,
 * что скамейки, фонари и перголы в Mazza Seyil. Бренд у обоих сетов один
 * (matkasym-shaar), так что меняется только поле set у товаров, а сам сет убирается
 * из списка бренда — иначе он остался бы висеть пустым разделом в каталоге.
 *
 *   node scripts/merge-velo-into-mazza.js           # показать, что изменится
 *   node scripts/merge-velo-into-mazza.js --apply   # выполнить (с бэкапом)
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');
const Brand = require('../models/Brand');

const APPLY = process.argv.includes('--apply');
const FROM = 'velo-shaar';
const TO   = 'mazza-seyil';
const BRAND = 'matkasym-shaar';

(async () => {
  await mongoose.connect(MONGO_URI);

  const products = await Product.find({ set: FROM }).select('name fullName sku brand category').lean();
  const brand = await Brand.findOne({ key: BRAND });
  // В брендах сет опознаётся полем key (не slug — так в модели Brand)
  const setEntry = brand?.sets?.find(s => s.key === FROM);
  const target   = brand?.sets?.find(s => s.key === TO);

  console.log(`Товаров в сете «${FROM}»: ${products.length}`);
  products.forEach(p => console.log(`   ${(p.fullName || p.name).slice(0, 50).padEnd(50)} ${p.category || '—'}`
    + (p.brand !== BRAND ? `   ⚠ бренд ${p.brand}` : '')));
  console.log(`\nСет в бренде ${BRAND}: ${setEntry ? `«${setEntry.label}» (порядок ${setEntry.order})` : 'не найден'}`);
  console.log(`Приёмник: ${target ? `«${target.label}»` : `⚠ сета ${TO} нет в бренде — переносить некуда`}`);

  if (!APPLY) {
    console.log('\nПредпросмотр. Для выполнения — с флагом --apply');
    await mongoose.disconnect();
    return;
  }
  if (!target) { console.error('Прерываю: сет-приёмник не найден'); process.exit(1); }

  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `velo-to-mazza-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify({ products, setEntry }, null, 2));
  console.log(`\nБэкап: ${backup}`);

  const r = await Product.updateMany({ set: FROM }, { $set: { set: TO } });
  console.log(`✓ Переведено товаров: ${r.modifiedCount}`);

  if (setEntry) {
    brand.sets = brand.sets.filter(s => s.key !== FROM);
    await brand.save();
    console.log(`✓ Сет «${setEntry.label}» убран из бренда ${BRAND}`);
  }

  const left = await Product.countDocuments({ set: FROM });
  console.log(left ? `⚠ осталось товаров в ${FROM}: ${left}` : `✓ в сете ${FROM} не осталось товаров`);

  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
