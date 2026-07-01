#!/usr/bin/env node
/**
 * Быстрая очистка каталога Битрикс24
 */

const axios = require('axios');
const WEBHOOK = 'https://matkasymov.bitrix24.kz/rest/153247/5hrd2zm94b22y94p/';

async function call(method, params = {}) {
  const { data } = await axios.post(WEBHOOK + method, params);
  return data.result;
}

async function clean() {
  console.log('🗑️  Быстрая очистка Битрикс24...\n');

  // Удаляем товары батчами
  let deleted = 0;
  while (true) {
    const products = await call('crm.product.list', { start: 0, order: { ID: 'ASC' } });
    if (!products || products.length === 0) break;

    // Batch delete
    const cmd = {};
    products.slice(0, 50).forEach((p, i) => {
      cmd[`del_${i}`] = `crm.product.delete?id=${p.ID}`;
    });

    await call('batch', { cmd });
    deleted += Object.keys(cmd).length;
    process.stdout.write(`\r  Удалено товаров: ${deleted}`);
  }
  console.log('\n');

  // Удаляем разделы (начиная с дочерних)
  console.log('🗑️  Удаляю разделы...');
  let sectionsDeleted = 0;
  for (let i = 0; i < 5; i++) {  // несколько проходов для вложенных
    const sections = await call('crm.productsection.list');
    if (!sections || sections.length === 0) break;

    for (const section of sections) {
      try {
        await call('crm.productsection.delete', { id: section.ID });
        sectionsDeleted++;
        process.stdout.write('.');
      } catch (e) {}
    }
  }
  console.log(`\n  Удалено разделов: ${sectionsDeleted}`);

  console.log('\n✅ Очистка завершена!');
}

clean().catch(console.error);
