/**
 * Импорт электрощитов от китайского поставщика 山东山发电气有限公司
 * Запуск: node scripts/import-china-shields.js
 */

const mongoose = require('mongoose');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');

// Production MongoDB URI
const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym';

// Курс юаня к сому
const CNY_TO_KGS = 12.5;

// Данные поставщика
const supplierData = {
  name: '山东山发电气有限公司 (Шаньдун Шаньфа)',
  phone: '',
  instagram: '',
  notes: 'Китайский производитель электрощитового оборудования. Заказ от 2025-09-27. Доставка до порта Иу включена.',
};

// Товары из коммерческого предложения
const products = [
  // 001 - Коробка основания
  { category: 'Коробка основания', size: '400×300×150', qty: 50, priceYuan: 92, weight: '5 кг', sku: 'SF-001-400x300x150' },
  { category: 'Коробка основания', size: '500×400×200', qty: 50, priceYuan: 113, weight: '7.9 кг', sku: 'SF-001-500x400x200' },
  { category: 'Коробка основания', size: '600×500×200', qty: 20, priceYuan: 167, weight: '11 кг', sku: 'SF-001-600x500x200' },
  { category: 'Коробка основания', size: '800×600×250', qty: 20, priceYuan: 250, weight: '17 кг', sku: 'SF-001-800x600x250' },
  { category: 'Коробка основания', size: '900×700×200', qty: 20, priceYuan: 317, weight: '20.9 кг', sku: 'SF-001-900x700x200' },
  { category: 'Коробка основания', size: '1000×800×300', qty: 20, priceYuan: 417, weight: '28.5 кг', sku: 'SF-001-1000x800x300' },

  // 005 - Нержавейка с защитой от дождя
  { category: 'Щит из нержавейки', size: '500×400×180', qty: 15, priceYuan: 200, weight: '5.5 кг', sku: 'SF-005-500x400x180' },
  { category: 'Щит из нержавейки', size: '600×500×180', qty: 15, priceYuan: 267, weight: '7.5 кг', sku: 'SF-005-600x500x180' },
  { category: 'Щит из нержавейки', size: '800×600×250', qty: 15, priceYuan: 425, weight: '12.5 кг', sku: 'SF-005-800x600x250' },
  { category: 'Щит из нержавейки', size: '900×700×200', qty: 15, priceYuan: 500, weight: '13.5 кг', sku: 'SF-005-900x700x200' },

  // 007 - Распред. щит накладной
  { category: 'Распред. щит накладной', size: '12 модулей', qty: 5, priceYuan: 65, weight: '2.1 кг', sku: 'SF-007-12M' },
  { category: 'Распред. щит накладной', size: '18 модулей', qty: 5, priceYuan: 83, weight: '2.6 кг', sku: 'SF-007-18M' },
  { category: 'Распред. щит накладной', size: '24 модуля (2 ряда)', qty: 5, priceYuan: 134, weight: '3.3 кг', sku: 'SF-007-24M' },
  { category: 'Распред. щит накладной', size: '36 модулей (2 ряда)', qty: 5, priceYuan: 168, weight: '4.7 кг', sku: 'SF-007-36M' },

  // 008 - Распред. щит встраиваемый
  { category: 'Распред. щит встраиваемый', size: '12 модулей', qty: 50, priceYuan: 75, weight: '1.6 кг', sku: 'SF-008-12M' },
  { category: 'Распред. щит встраиваемый', size: '18 модулей', qty: 50, priceYuan: 90, weight: '2 кг', sku: 'SF-008-18M' },
  { category: 'Распред. щит встраиваемый', size: '24 модуля (2 ряда)', qty: 20, priceYuan: 153, weight: '2.9 кг', sku: 'SF-008-24M' },
  { category: 'Распред. щит встраиваемый', size: '36 модулей (2 ряда)', qty: 20, priceYuan: 183, weight: '3.5 кг', sku: 'SF-008-36M' },

  // 009 - GGD напольный шкаф
  { category: 'Напольный шкаф GGD', size: '2200×800×600', qty: 1, priceYuan: 2000, weight: '130 кг', sku: 'SF-009-2200x800x600' },

  // 011 - Уличный шкаф
  { category: 'Уличный шкаф', size: '1500×600×400', qty: 1, priceYuan: 583, weight: '35 кг', sku: 'SF-011-1500x600x400' },

  // 012 - Премиум защита от дождя
  { category: 'Щит премиум (уличный)', size: '500×400×200', qty: 3, priceYuan: 125, weight: '6 кг', sku: 'SF-012-500x400x200' },
  { category: 'Щит премиум (уличный)', size: '600×500×200', qty: 3, priceYuan: 167, weight: '9 кг', sku: 'SF-012-600x500x200' },
  { category: 'Щит премиум (уличный)', size: '800×600×200', qty: 3, priceYuan: 267, weight: '14.5 кг', sku: 'SF-012-800x600x200' },
];

function getMaterial(category) {
  if (category.includes('нержавейк')) return 'Нержавеющая сталь';
  if (category.includes('Распред')) return 'Пластик';
  return 'Сталь с покрытием';
}

async function importProducts() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✓ Подключено к MongoDB Atlas');

    // 1. Создаём или находим поставщика
    let supplier = await Supplier.findOne({ name: supplierData.name });
    if (!supplier) {
      supplier = await Supplier.create(supplierData);
      console.log('✓ Создан поставщик:', supplier.name);
    } else {
      console.log('✓ Поставщик уже существует:', supplier.name);
    }

    // 2. Добавляем товары
    const createdProductIds = [];

    for (const p of products) {
      const priceCost = Math.round(p.priceYuan * CNY_TO_KGS); // Закупочная в сомах

      const productData = {
        name: `${p.category} ${p.size}`,
        fullName: `Электрощит ${p.category} ${p.size}`,
        sku: `MKS-${p.sku}`,
        brand: 'matkasym-shaar',
        set: 'kooz-koopsuzduk',
        category: 'Электрощиты',

        // Привозной товар
        isSupplied: true,
        supplier: {
          company: supplierData.name,
          contactName: '',
          sku: p.sku,
        },

        // Цены
        priceCost: priceCost,
        priceWholesale: 0,  // ещё не установлена
        priceDealer: 0,     // ещё не установлена
        price: 0,           // розничная ещё не установлена
        priceUndefined: true,

        // Размеры и вес
        dimensions: p.size,
        specs: [
          { key: 'Вес', value: p.weight },
          { key: 'Материал', value: getMaterial(p.category) },
        ],

        // Склад
        stock: p.qty,
        inStock: p.qty > 0,
        stockStatus: 'in_stock',

        // Статус
        productStatus: 'for_sale',
        isNew: true,
      };

      // Проверяем, нет ли уже такого товара
      const existing = await Product.findOne({ sku: productData.sku });
      if (existing) {
        console.log(`  ⏭ Пропущен (уже есть): ${productData.name}`);
        createdProductIds.push(existing._id);
        continue;
      }

      const product = await Product.create(productData);
      createdProductIds.push(product._id);
      console.log(`  ✓ Создан: ${productData.name} | ${priceCost} сом | ${p.qty} шт`);
    }

    // 3. Привязываем товары к поставщику
    await Supplier.findByIdAndUpdate(supplier._id, {
      $addToSet: { products: { $each: createdProductIds } }
    });
    console.log(`\n✓ Привязано ${createdProductIds.length} товаров к поставщику`);

    // Итоги
    console.log('\n' + '='.repeat(50));
    console.log('ИТОГО:');
    console.log(`  Поставщик: ${supplier.name}`);
    console.log(`  Товаров добавлено: ${createdProductIds.length}`);
    console.log(`  Сет: kooz-koopsuzduk`);
    console.log(`  Категория: Электрощиты`);
    console.log('='.repeat(50));

  } catch (err) {
    console.error('Ошибка:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Отключено от MongoDB');
  }
}

importProducts();
