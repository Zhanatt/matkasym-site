#!/usr/bin/env node
/**
 * Полная синхронизация каталога с Битрикс24: фото, цены, характеристики.
 *
 * Товары в ликвидации/снятые с производства не выгружаются.
 * Товар, уже загруженный в Битрикс (совпал XML_ID), обновляется без перезаливки фото:
 * повторная отправка fileData создаёт в Битриксе новые файлы-дубликаты.
 *
 * Сухой прогон:  node scripts/sync-bitrix24-all.js --dry
 * Боевой запуск: node scripts/sync-bitrix24-all.js --apply
 *
 * Можно ограничиться одним сетом: --set=bekem-fasad (можно перечислить через запятую).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const bitrix = require('../utils/bitrix24');

const MONGO_URI = require('../lib/atlas');

// Выгружаем всё, кроме ликвидации и снятых с производства.
const SKIPPED_STATUSES = ['liquidation', 'discontinued'];

const BRAND_SECTION = {
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

const setName = (product) => SET_NAMES[product.set] || product.set || 'other';

async function loadSectionIndex() {
  const sections = await bitrix.getSections();
  const roots = new Map();
  const children = new Map();

  for (const s of sections) {
    if (!s.SECTION_ID) roots.set(s.NAME, s.ID);
    else children.set(`${s.SECTION_ID}:${s.NAME}`, s.ID);
  }
  return { roots, children };
}

async function resolveSection(index, product, { apply }) {
  const brandName = BRAND_SECTION[product.brand];
  if (!brandName) return null;

  let brandId = index.roots.get(brandName);
  if (!brandId) {
    if (!apply) return `NEW:${brandName}`;
    brandId = await bitrix.createSection(brandName, null);
    index.roots.set(brandName, brandId);
  }

  const name = setName(product);
  const key = `${brandId}:${name}`;
  let setId = index.children.get(key);
  if (!setId) {
    if (!apply) return `NEW:${brandName}/${name}`;
    setId = await bitrix.createSection(name, brandId);
    index.children.set(key, setId);
  }
  return setId;
}

async function run() {
  const apply = process.argv.includes('--apply');
  const dry = process.argv.includes('--dry');
  if (!apply && !dry) {
    console.error('Укажите --dry (сухой прогон) или --apply (боевой запуск).');
    process.exit(1);
  }

  const setArg = process.argv.find((a) => a.startsWith('--set='));
  const onlySets = setArg ? setArg.slice(6).split(',').map((s) => s.trim()).filter(Boolean) : null;

  await mongoose.connect(MONGO_URI);

  const filter = {
    productStatus: { $nin: SKIPPED_STATUSES },
    brand: { $in: Object.keys(BRAND_SECTION) },
  };
  if (onlySets) {
    filter.set = { $in: onlySets };
    console.log(`Только сеты: ${onlySets.join(', ')}\n`);
  }

  const products = await Product.find(filter).lean();

  const skipped = await Product.countDocuments({
    ...(onlySets ? { set: { $in: onlySets } } : {}),
    productStatus: { $in: SKIPPED_STATUSES },
  });

  console.log(`Товаров к выгрузке: ${products.length}`);
  console.log(`Пропущено (ликвидация / снят с производства): ${skipped}\n`);

  const inBitrix = await bitrix.getProducts();
  const byXmlId = new Map(inBitrix.map((p) => [p.XML_ID, p]));
  console.log(`Уже в Битриксе: ${inBitrix.length} товаров\n`);

  const index = await loadSectionIndex();
  const propertyIndex = await bitrix.getPropertyIndex();

  if (dry) {
    const unmapped = new Map();
    const newSections = new Set();
    let toCreate = 0;
    let toUpdate = 0;
    let noBrand = 0;

    for (const product of products) {
      const section = await resolveSection(index, product, { apply: false });
      if (!section) { noBrand++; continue; }
      if (String(section).startsWith('NEW:')) newSections.add(section.slice(4));

      if (byXmlId.has(product._id.toString())) toUpdate++;
      else toCreate++;

      for (const key of bitrix.mapSpecsToProperties(product, propertyIndex).unmapped) {
        unmapped.set(key, (unmapped.get(key) || 0) + 1);
      }
    }

    console.log(`Будет создано: ${toCreate}`);
    console.log(`Будет обновлено: ${toUpdate}`);
    console.log(`Без раздела (неизвестный бренд): ${noBrand}\n`);

    if (newSections.size) {
      console.log('Разделы, которых нет в Битриксе:');
      [...newSections].forEach((s) => console.log(`  + ${s}`));
      console.log('');
    }

    const sorted = [...unmapped.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`Характеристики без поля в Битриксе: ${sorted.length} видов`);
    sorted.slice(0, 40).forEach(([key, n]) => console.log(`  ${String(n).padStart(4)} × "${key}"`));

    await mongoose.disconnect();
    return;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let created = 0;
  let updated = 0;
  let failed = 0;

  // Битрикс обрывает нас двумя способами, и оба лгут о результате:
  // axios отваливается по таймауту, хотя товар уже создан, а портал блокирует метод
  // за превышение лимита времени. Поэтому перед повтором сверяемся с XML_ID.
  async function createOnce(product, fields) {
    try {
      await bitrix.createProduct(fields);
      return;
    } catch (err) {
      if (/символьным кодом/.test(err.message)) {
        await bitrix.createProduct({ ...fields, CODE: `mks-${product._id}` });
        return;
      }
      if (await bitrix.getProductByXmlId(product._id.toString())) return; // всё-таки создался
      throw err;
    }
  }

  for (const product of products) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const section = await resolveSection(index, product, { apply: true });
        if (!section) break;

        const existing = byXmlId.get(product._id.toString());
        const fields = await bitrix.mapProductToBitrix(product, section, {
          propertyIndex,
          includeCode: !existing,
          // У существующего товара фото уже загружены: повторная отправка плодит дубликаты файлов.
          skipImages: Boolean(existing && existing.PREVIEW_PICTURE),
        });

        if (existing) {
          await bitrix.updateProduct(existing.ID, fields);
          updated++;
        } else {
          await createOnce(product, fields);
          created++;
        }
        break;
      } catch (err) {
        const throttled = /operation time limit|Method is blocked/i.test(err.message);
        // Сеть отваливается целыми пачками (пропал DNS, оборвалось соединение) —
        // такие запросы до Битрикса не доходят, повторять их безопасно.
        const network = /ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|socket hang up/i.test(err.message);
        if (attempt < 3 && (throttled || network)) {
          const pause = throttled ? 60000 * attempt : 10000 * attempt;
          const reason = throttled ? 'портал заблокировал метод' : 'сетевой сбой';
          console.log(`\n  … ${reason}, жду ${pause / 1000} с (${product.fullName})`);
          await sleep(pause);
          continue;
        }
        failed++;
        console.log(`\n  ! ${product.fullName}: ${err.message}`);
        break;
      }
    }

    process.stdout.write(`\r  создано ${created}, обновлено ${updated}, ошибок ${failed}`);
    await sleep(300);
  }

  console.log(`\n\nГотово. Создано ${created}, обновлено ${updated}, ошибок ${failed}.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
