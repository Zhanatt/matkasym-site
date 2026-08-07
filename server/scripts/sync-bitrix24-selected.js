#!/usr/bin/env node
/**
 * Точечная синхронизация отдельных товаров с Битрикс24 — с фото, ценами и характеристиками.
 * Товары в ликвидации не выгружаются.
 *
 * Запуск: node scripts/sync-bitrix24-selected.js "Keremet" "MURADYL"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const bitrix = require('../utils/bitrix24');

const MONGO_URI = require('../lib/atlas');

const SKIPPED_STATUSES = ['liquidation', 'discontinued'];

const SET_NAMES = {
  'taza-kiym': 'Taza Kiym',
  'achyk-asman': 'Achyk Asman',
  'den-sooluk': 'Den Sooluk',
  'jenil-ashkana': 'Jenil Ashkana',
  'kosh-keliniz': 'Kosh Keliniz',
  'konok-keldi': 'Konok Keldi',
  'baary-oorunda': 'Baary Oorunda',
  'sanarip-tv': 'Sanarip TV',
  'shirin-balalyk': 'Shirin Balalyk',
  'korkom-aiym': 'Korkom Aiym',
  'zhashyl-omur': 'Zhashyl Omur',
  'uydo-ishtoo': 'Uydo Ishtoo',
};

const BRAND_SECTION = {
  'matkasym-home': 'HOME',
  'matkasym-shaar': 'SHAAR',
  'matkasym-kyzmat': 'KYZMAT',
};

async function run() {
  const patterns = process.argv.slice(2);
  if (!patterns.length) {
    console.error('Укажите шаблоны названий: node scripts/sync-bitrix24-selected.js "Keremet" "MURADYL"');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('MongoDB подключен\n');

  const regex = new RegExp(patterns.join('|'), 'i');
  const found = await Product.find({ $or: [{ name: regex }, { fullName: regex }] }).lean();

  const products = found.filter((p) => !SKIPPED_STATUSES.includes(p.productStatus));
  const skipped = found.filter((p) => SKIPPED_STATUSES.includes(p.productStatus));

  skipped.forEach((p) => console.log(`  пропуск (${p.productStatus}): ${p.fullName}`));
  if (skipped.length) console.log('');

  // Разделы ищем в паре бренд→сет: имя сета в Битриксе не уникально между брендами.
  const sections = await bitrix.getSections();
  const sectionId = (product) => {
    const brandName = BRAND_SECTION[product.brand];
    const brand = sections.find((s) => s.NAME === brandName && !s.SECTION_ID);
    if (!brand) return null;
    const setName = SET_NAMES[product.set] || product.set;
    const set = sections.find((s) => s.NAME === setName && String(s.SECTION_ID) === String(brand.ID));
    return set ? set.ID : null;
  };

  for (const product of products) {
    const section = sectionId(product);
    if (!section) {
      console.log(`  ! нет раздела для ${product.fullName} (${product.brand}/${product.set})`);
      continue;
    }

    const fields = await bitrix.mapProductToBitrix(product, section, {
      active: 'Y',
      onUnmapped: (keys) => console.log(`    ~ без поля в Битриксе: ${keys.join(', ')}`),
    });

    const existing = await bitrix.getProductByXmlId(product._id.toString());
    if (existing) {
      await bitrix.updateProduct(existing.ID, fields);
      console.log(`  обновлён ID=${existing.ID}: ${product.fullName}`);
    } else {
      const id = await bitrix.createProduct(fields);
      console.log(`  создан ID=${id}: ${product.fullName}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nГотово.');
}

run().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
