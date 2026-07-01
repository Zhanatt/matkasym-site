#!/usr/bin/env node
/**
 * Синхронизация каталога с Битрикс24 v2
 * Структура: Brand → Set → Product (с картинками)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const bitrix = require('../utils/bitrix24');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym';

const BRAND_NAMES = {
  'matkasym-home': 'HOME',
  'matkasym-shaar': 'SHAAR',
  'matkasym-kyzmat': 'KYZMAT',
};

const SET_NAMES = {
  'taza-kiym': 'Taza Kiym',
  'den-sooluk': 'Den Sooluk',
  'achyk-asman': 'Achyk Asman',
  'jenil-ashkana': 'Jenil Ashkana',
  'kosh-keliniz': 'Kosh Keliniz',
  'konok-keldi': 'Konok Keldi',
  'baary-oorunda': 'Baary Oorunda',
  'sanarip-tv': 'Sanarip TV',
  'shirin-balalyk': 'Shirin Balalyk',
  'korkom-aiym': 'Korkom Aiym',
  'zhashyl-omur': 'Zhashyl Omur',
  'uydo-ishtoo': 'Uydo Ishtoo',
  'mazza-seiyl': 'Mazza Seiyl',
  '0-tashtandy': '0-Tashtandy',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'bekem-fasad': 'Bekem Fasad',
  'bilim-kelechek': 'Bilim Kelechek',
  'uzak-koldon': 'Uzak Koldon',
  'dayar-tutuk': 'Dayar Tutuk',
  'onuguu-set': 'Onuguu Set',
  'poly-fabrikat': 'Poly Fabrikat',
};

async function deleteAllSections() {
  console.log('🗑️  Удаляю старые разделы...');
  const sections = await bitrix.getSections();
  for (const section of sections) {
    try {
      await bitrix.call('crm.productsection.delete', { id: section.ID });
      process.stdout.write('.');
    } catch (e) {}
  }
  console.log(' Готово\n');
}

async function deleteAllProducts() {
  console.log('🗑️  Удаляю старые товары...');
  const products = await bitrix.getProducts();
  let count = 0;
  for (const product of products) {
    try {
      await bitrix.deleteProduct(product.ID);
      count++;
      if (count % 50 === 0) process.stdout.write(`${count}...`);
    } catch (e) {}
  }
  console.log(` Удалено ${count}\n`);
}

async function syncCatalog() {
  console.log('🔄 Синхронизация с Битрикс24 v2\n');
  console.log('Структура: Brand → Set → Product\n');

  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB подключен\n');

  // Удаляем всё старое
  await deleteAllProducts();
  await deleteAllSections();

  // Создаём главные разделы (бренды)
  console.log('📁 Создаю структуру брендов и сетов...\n');
  const brandSections = {};
  const setSections = {};

  for (const [brandKey, brandName] of Object.entries(BRAND_NAMES)) {
    const brandId = await bitrix.createSection(brandName, null);
    brandSections[brandKey] = brandId;
    console.log(`  ✓ ${brandName} (ID: ${brandId})`);
  }

  // Получаем товары и группируем по brand → set
  const products = await Product.find({
    productStatus: { $in: ['for_sale', 'test_sale'] },
    brand: { $in: Object.keys(BRAND_NAMES) }
  }).lean();

  console.log(`\n📦 Товаров для синхронизации: ${products.length}\n`);

  // Группируем по brand и set
  const grouped = {};
  products.forEach(p => {
    const brand = p.brand;
    const set = p.set || 'other';
    if (!grouped[brand]) grouped[brand] = {};
    if (!grouped[brand][set]) grouped[brand][set] = [];
    grouped[brand][set].push(p);
  });

  // Создаём сеты как подразделы брендов
  for (const [brandKey, sets] of Object.entries(grouped)) {
    const brandId = brandSections[brandKey];
    for (const setKey of Object.keys(sets)) {
      const setName = SET_NAMES[setKey] || setKey;
      const setId = await bitrix.createSection(setName, brandId);
      setSections[`${brandKey}:${setKey}`] = setId;
      console.log(`    ✓ ${BRAND_NAMES[brandKey]} → ${setName} (ID: ${setId})`);
    }
  }

  console.log('\n📤 Загружаю товары с картинками...\n');

  let created = 0, errors = 0;

  for (const [brandKey, sets] of Object.entries(grouped)) {
    for (const [setKey, prods] of Object.entries(sets)) {
      const sectionId = setSections[`${brandKey}:${setKey}`];

      for (const product of prods) {
        try {
          const fields = await bitrix.mapProductToBitrix(product, sectionId);
          await bitrix.createProduct(fields);
          created++;
          process.stdout.write(`\r  Создано: ${created}, Ошибок: ${errors}`);

          // Пауза чтобы не превысить лимит
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          errors++;
        }
      }
    }
  }

  console.log(`\n\n✅ Синхронизация завершена!`);
  console.log(`   Создано товаров: ${created}`);
  console.log(`   Ошибок: ${errors}`);

  await mongoose.disconnect();
}

syncCatalog().catch(err => {
  console.error('Критическая ошибка:', err);
  process.exit(1);
});
