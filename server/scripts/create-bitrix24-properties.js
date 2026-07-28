#!/usr/bin/env node
/**
 * Заводит в каталоге Битрикс24 свойства под характеристики, которые есть в specs товаров,
 * но которым не нашлось поля. Идемпотентно: свойство с таким именем не дублируется.
 *
 * Сухой прогон:  node scripts/create-bitrix24-properties.js --dry
 * Боевой запуск: node scripts/create-bitrix24-properties.js --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const bitrix = require('../utils/bitrix24');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym';
const SKIPPED_STATUSES = ['liquidation', 'discontinued'];

// Из нескольких написаний одной характеристики берём то, что чаще встречается,
// а при равенстве — то, что начинается с заглавной буквы.
function pickDisplayName(variants) {
  return [...variants.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const aUpper = /^[А-ЯЁ]/.test(a[0]);
    const bUpper = /^[А-ЯЁ]/.test(b[0]);
    if (aUpper !== bUpper) return aUpper ? -1 : 1;
    return a[0].localeCompare(b[0]);
  })[0][0];
}

async function run() {
  const apply = process.argv.includes('--apply');
  if (!apply && !process.argv.includes('--dry')) {
    console.error('Укажите --dry или --apply.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  const products = await Product.find({ productStatus: { $nin: SKIPPED_STATUSES } }).lean();

  const propertyIndex = await bitrix.getPropertyIndex();

  // Собираем непокрытые характеристики: нормализованный ключ → варианты написания.
  const missing = new Map();
  for (const product of products) {
    for (const key of bitrix.mapSpecsToProperties(product, propertyIndex).unmapped) {
      const norm = bitrix.normSpecKey(key);
      // У ключа есть синоним — поле будет создано под каноничным именем, дубль не нужен.
      if (bitrix.ALIAS_INDEX.has(norm)) continue;
      if (!missing.has(norm)) missing.set(norm, new Map());
      const variants = missing.get(norm);
      variants.set(key.trim(), (variants.get(key.trim()) || 0) + 1);
    }
  }

  const names = [...missing.values()]
    .map(pickDisplayName)
    .map((name) => name[0].toUpperCase() + name.slice(1))
    .sort((a, b) => a.localeCompare(b));
  console.log(`Характеристик без поля: ${names.length}\n`);

  if (!apply) {
    names.forEach((n) => console.log(`  + ${n}`));
    console.log('\nСухой прогон, ничего не создано.');
    await mongoose.disconnect();
    return;
  }

  let created = 0;
  for (const name of names) {
    const id = await bitrix.call('crm.product.property.add', {
      fields: {
        NAME: name,
        IBLOCK_ID: Number(bitrix.CATALOG_ID),
        PROPERTY_TYPE: 'S',
        ACTIVE: 'Y',
        MULTIPLE: 'N',
      },
    });
    created++;
    console.log(`  + PROPERTY_${id} "${name}"`);
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\nСоздано свойств: ${created}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
