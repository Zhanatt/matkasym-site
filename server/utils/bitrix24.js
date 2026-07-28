const axios = require('axios');

const BITRIX_WEBHOOK = 'https://matkasymov.bitrix24.kz/rest/153247/5hrd2zm94b22y94p/';
const CATALOG_ID = '15';

// Оригиналы в Cloudinary бывают по 5 МБ; в base64 это ~7 МБ, и Битрикс не успевает
// принять их за таймаут. Просим Cloudinary отдать сжатую копию — картинка та же, вес в разы меньше.
function compressedImageUrl(url, width = 1200) {
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  return url.replace('/image/upload/', `/image/upload/f_jpg,q_auto:eco,w_${width},c_limit/`);
}

async function downloadImageAsBase64(url, width) {
  // Сжатую копию Cloudinary генерирует по первому запросу и может ответить не сразу —
  // тогда откатываемся на оригинал, пусть и тяжёлый.
  for (const candidate of [compressedImageUrl(url, width), url]) {
    try {
      const response = await axios.get(candidate, { responseType: 'arraybuffer', timeout: 30000 });
      return Buffer.from(response.data, 'binary').toString('base64');
    } catch (err) {
      continue;
    }
  }
  return null;
}

const bitrix = axios.create({
  baseURL: BITRIX_WEBHOOK,
  timeout: 120000,  // заливка товара с картинками заметно дольше обычного запроса
  maxBodyLength: Infinity,
});

async function call(method, params = {}) {
  let data;
  try {
    ({ data } = await bitrix.post(method, params));
  } catch (err) {
    // При 4xx Битрикс кладёт причину в тело ответа — без неё остаётся голый «status code 400».
    const body = err.response?.data;
    if (body?.error) throw new Error(`Bitrix24 ${method}: ${body.error_description || body.error}`);
    throw err;
  }
  if (data.error) throw new Error(`Bitrix24 ${method}: ${data.error_description || data.error}`);
  return data.result;
}

async function getSections() {
  return call('crm.productsection.list');
}

async function createSection(name, parentId = null) {
  return call('crm.productsection.add', {
    fields: {
      CATALOG_ID,
      NAME: name,
      SECTION_ID: parentId,
    }
  });
}

async function getProducts(filter = {}) {
  const result = [];
  let start = 0;
  while (true) {
    const batch = await call('crm.product.list', { filter, start, order: { ID: 'ASC' } });
    result.push(...batch);
    if (batch.length < 50) break;
    start += 50;
  }
  return result;
}

async function getProductByXmlId(xmlId) {
  const products = await call('crm.product.list', { filter: { XML_ID: xmlId } });
  return products[0] || null;
}

async function createProduct(fields) {
  return call('crm.product.add', { fields: { CATALOG_ID, ...fields } });
}

async function updateProduct(id, fields) {
  return call('crm.product.update', { id, fields });
}

async function deleteProduct(id) {
  return call('crm.product.delete', { id });
}

// Ключи specs в MongoDB пишутся вручную и разнобоем: «Кол-во струн», «Макс. нагрузка»,
// «в упаковке габариты (ДxШxв)». Приводим к общему виду, прежде чем искать поле Битрикса.
function normSpecKey(key) {
  return String(key)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/x/g, 'х')            // латинская x в габаритах ДxШxВ
    .replace(/кол-?во/g, 'количество')
    .replace(/макс\.?(?!имальная)/g, 'максимальная')
    .replace(/[^а-я0-9]/g, '');
}

// Одна и та же характеристика зовётся в базе по-разному, а поле в Битриксе одно.
// Слева — как пишут в specs, справа — точное имя свойства в каталоге Битрикса.
const SPEC_ALIASES = {
  'Габарит': 'Габариты (ДxШxВ)',
  'Габариты': 'Габариты (ДxШxВ)',
  'Материал корпуса': 'Материал',
  'Кол-во струн': 'Количество струн/прутов',
  'Количество струн': 'Количество струн/прутов',
  'Количество прутов': 'Количество струн/прутов',
  'Кол-во секций': 'Количество секции',
  'Количество секций': 'Количество секции',
  'Вес товара': 'Вес',
  'Вес товара в упаковке': 'Вес в упаковке',
  'В упаковке габариты': 'Габариты в упаковке (ДxШxВ)',
  'В упаковке габариты (ДxШxВ)': 'Габариты в упаковке (ДxШxВ)',
  'Габариты в упаковке': 'Габариты в упаковке (ДxШxВ)',
  'Толщина стенок': 'Толщина стенки',
  'оссобенности': 'Особенность',
  // Поле в каталоге Битрикса заведено с опечаткой — переименовывать его не рискуем.
  'Кол-во полок': 'Колличество полок',
  'Количество полок': 'Колличество полок',
};

const ALIAS_INDEX = new Map(
  Object.entries(SPEC_ALIASES).map(([from, to]) => [normSpecKey(from), normSpecKey(to)])
);

// «Цвета» (PROPERTY_205) намеренно пропущен: это список с единственным
// мусорным значением «Y», записать в него белый/чёрный нельзя.
const IGNORED_SPECS = new Set([normSpecKey('Цвет'), normSpecKey('Цвета')]);

// Служебные свойства заполняются отдельно, из specs в них попадать не должно.
const RESERVED_PROPERTIES = new Set(['45', '185', '187', '197']);

let propertyIndexCache = null;

// Соответствие specs → PROPERTY_* строится из самого Битрикса, а не хардкодится:
// иначе список разъезжается при каждом новом поле в каталоге.
async function getPropertyIndex({ refresh = false } = {}) {
  if (propertyIndexCache && !refresh) return propertyIndexCache;

  const properties = await call('crm.product.property.list', {
    filter: { catalogId: Number(CATALOG_ID) },
  });

  const index = new Map();
  for (const property of properties) {
    if (RESERVED_PROPERTIES.has(String(property.ID))) continue;
    if (property.PROPERTY_TYPE !== 'S' && property.PROPERTY_TYPE !== 'N') continue;
    index.set(normSpecKey(property.NAME), `PROPERTY_${property.ID}`);
  }

  propertyIndexCache = index;
  return index;
}

function mapSpecsToProperties(product, propertyIndex) {
  const fields = {};
  const unmapped = [];

  for (const spec of product.specs || []) {
    const value = String(spec.value ?? '').trim();
    if (!value) continue;

    let key = normSpecKey(spec.key);
    if (IGNORED_SPECS.has(key)) continue;
    if (ALIAS_INDEX.has(key)) key = ALIAS_INDEX.get(key);

    const property = propertyIndex.get(key);
    if (property) fields[property] = value;
    else unmapped.push(spec.key);
  }

  return { fields, unmapped };
}

async function mapProductToBitrix(product, sectionId, options = {}) {
  const fields = {
    NAME: product.fullName || product.name,
    XML_ID: product._id.toString(),
    SECTION_ID: sectionId,
    PRICE: product.price || 0,
    CURRENCY_ID: 'KGS',
    ACTIVE: options.active || (product.productStatus === 'for_sale' ? 'Y' : 'N'),
    DESCRIPTION: product.description || '',
    DESCRIPTION_TYPE: 'text',
  };

  // CODE в Битриксе уникален. Пустой sku заставляет Битрикс собрать код из названия,
  // а близкие названия («LION 4 +» и «LION 4») дают один и тот же код — отсюда конфликты.
  // При обновлении код не трогаем: он мог уйти в ссылки.
  if (options.includeCode !== false) {
    fields.CODE = product.sku?.trim() || `mks-${product._id}`;
  }
  if (product.fullName) fields.PROPERTY_197 = product.fullName;
  if (product.priceWholesale) fields.PROPERTY_185 = product.priceWholesale;
  // PROPERTY_187 — тип «Деньги», принимает только строку «сумма|валюта».
  if (product.priceDealer) fields.PROPERTY_187 = `${product.priceDealer}|KGS`;

  const propertyIndex = options.propertyIndex || (await getPropertyIndex());
  const { fields: specFields, unmapped } = mapSpecsToProperties(product, propertyIndex);
  Object.assign(fields, specFields);
  if (unmapped.length && options.onUnmapped) options.onUnmapped(unmapped);

  if (options.skipImages) return fields;

  // Скачиваем ВСЕ картинки (макс 5)
  const images = product.images?.filter(url => url && url.startsWith('http')) || [];
  const imageFiles = [];

  for (let i = 0; i < Math.min(images.length, 5); i++) {
    const base64 = await downloadImageAsBase64(images[i]);
    if (base64) {
      imageFiles.push({ fileData: [`image_${i}.jpg`, base64] });
    }
  }

  if (imageFiles.length > 0) {
    // Превью — отдельная лёгкая копия: в списке товаров крупная картинка не нужна,
    // а раньше первое изображение уезжало трижды (превью + детальная + галерея).
    const preview = await downloadImageAsBase64(images[0], 400);
    fields.PREVIEW_PICTURE = preview ? { fileData: ['preview.jpg', preview] } : imageFiles[0];
    fields.DETAIL_PICTURE = imageFiles[0];
    fields.PROPERTY_45 = imageFiles;  // галерея
  }

  return fields;
}

module.exports = {
  call,
  getSections,
  createSection,
  getProducts,
  getProductByXmlId,
  createProduct,
  updateProduct,
  deleteProduct,
  mapProductToBitrix,
  mapSpecsToProperties,
  getPropertyIndex,
  normSpecKey,
  ALIAS_INDEX,
  downloadImageAsBase64,
  CATALOG_ID,
};
