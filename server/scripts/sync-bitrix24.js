#!/usr/bin/env node
/**
 * Синхронизация каталога с Битрикс24
 * Запуск: node scripts/sync-bitrix24.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const bitrix = require('../utils/bitrix24');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym';

async function ensureSection(name, sections, createdSections) {
  if (createdSections[name]) return createdSections[name];

  const existing = sections.find(s => s.NAME === name);
  if (existing) {
    createdSections[name] = existing.ID;
    return existing.ID;
  }

  console.log(`  Создаю раздел: ${name}`);
  const id = await bitrix.createSection(name);
  createdSections[name] = id;
  return id;
}

async function syncProducts() {
  console.log('🔄 Синхронизация с Битрикс24...\n');

  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB подключен\n');

  // Получаем разделы из Битрикс24
  const sections = await bitrix.getSections();
  console.log(`📁 Разделов в Битрикс24: ${sections.length}\n`);

  // Карта созданных разделов
  const createdSections = {};
  sections.forEach(s => { createdSections[s.NAME] = s.ID; });

  // Получаем товары из нашей БД (только for_sale)
  const products = await Product.find({
    productStatus: { $in: ['for_sale', 'test_sale'] },
    brand: { $in: ['matkasym-home', 'matkasym-shaar'] }
  }).lean();

  console.log(`📦 Товаров для синхронизации: ${products.length}\n`);

  let created = 0, updated = 0, errors = 0;

  for (const product of products) {
    try {
      const category = product.category || 'Прочее';
      const sectionId = await ensureSection(category, sections, createdSections);

      const existingProduct = await bitrix.getProductByXmlId(product._id.toString());
      const fields = await bitrix.mapProductToBitrix(product, sectionId);

      if (existingProduct) {
        await bitrix.updateProduct(existingProduct.ID, fields);
        updated++;
        process.stdout.write(`\r  Обновлено: ${updated}, Создано: ${created}, Ошибок: ${errors}`);
      } else {
        await bitrix.createProduct(fields);
        created++;
        process.stdout.write(`\r  Обновлено: ${updated}, Создано: ${created}, Ошибок: ${errors}`);
      }

      // Пауза чтобы не превысить лимит API
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      errors++;
      console.error(`\n❌ Ошибка: ${product.name} — ${err.message}`);
    }
  }

  console.log(`\n\n✅ Синхронизация завершена!`);
  console.log(`   Создано: ${created}`);
  console.log(`   Обновлено: ${updated}`);
  console.log(`   Ошибок: ${errors}`);

  await mongoose.disconnect();
}

syncProducts().catch(err => {
  console.error('Критическая ошибка:', err);
  process.exit(1);
});
