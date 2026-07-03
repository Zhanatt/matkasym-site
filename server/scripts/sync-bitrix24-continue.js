#!/usr/bin/env node
/**
 * Продолжение синхронизации - загружает только недостающие товары
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const bitrix = require('../utils/bitrix24');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym';

async function syncRemaining() {
  console.log('🔄 Продолжаю синхронизацию...\n');

  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB подключен\n');

  // Получаем существующие разделы
  const sections = await bitrix.getSections();
  console.log(`📁 Разделов в Битрикс24: ${sections.length}`);

  // Карта разделов по имени
  const sectionMap = {};
  sections.forEach(s => { sectionMap[s.NAME] = s.ID; });

  // Получаем все XML_ID уже загруженных товаров
  const existingProducts = await bitrix.getProducts();
  const existingIds = new Set(existingProducts.map(p => p.XML_ID));
  console.log(`📦 Уже загружено товаров: ${existingIds.size}\n`);

  // Получаем все товары из MongoDB
  const products = await Product.find({
    productStatus: { $in: ['for_sale', 'test_sale'] },
    brand: { $in: ['matkasym-home', 'matkasym-shaar', 'matkasym-kyzmat'] }
  }).lean();

  // Фильтруем - только те, которых ещё нет
  const toUpload = products.filter(p => !existingIds.has(p._id.toString()));
  console.log(`📤 Нужно загрузить: ${toUpload.length} товаров\n`);

  if (toUpload.length === 0) {
    console.log('✅ Все товары уже синхронизированы!');
    await mongoose.disconnect();
    return;
  }

  // Группируем по set для определения раздела
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

  let created = 0, errors = 0, skipped = 0;

  for (const product of toUpload) {
    try {
      const setKey = product.set || 'other';
      const setName = SET_NAMES[setKey] || setKey;
      const sectionId = sectionMap[setName];

      if (!sectionId) {
        skipped++;
        continue;
      }

      const fields = await bitrix.mapProductToBitrix(product, sectionId);
      await bitrix.createProduct(fields);
      created++;
      process.stdout.write(`\r  Создано: ${created}, Ошибок: ${errors}, Пропущено: ${skipped}`);

      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      errors++;
    }
  }

  console.log(`\n\n✅ Синхронизация завершена!`);
  console.log(`   Создано: ${created}`);
  console.log(`   Ошибок: ${errors}`);
  console.log(`   Пропущено (нет раздела): ${skipped}`);

  await mongoose.disconnect();
}

syncRemaining().catch(err => {
  console.error('Критическая ошибка:', err);
  process.exit(1);
});
