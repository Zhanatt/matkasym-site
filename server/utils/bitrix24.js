const axios = require('axios');

const BITRIX_WEBHOOK = 'https://matkasymov.bitrix24.kz/rest/153247/5hrd2zm94b22y94p/';
const CATALOG_ID = '15';

async function downloadImageAsBase64(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    return base64;
  } catch (err) {
    return null;
  }
}

const bitrix = axios.create({
  baseURL: BITRIX_WEBHOOK,
  timeout: 30000,
});

async function call(method, params = {}) {
  const { data } = await bitrix.post(method, params);
  if (data.error) throw new Error(`Bitrix24 error: ${data.error_description || data.error}`);
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

async function mapProductToBitrix(product, sectionId) {
  const fields = {
    NAME: product.fullName || product.name,
    XML_ID: product._id.toString(),
    SECTION_ID: sectionId,
    PRICE: product.price || 0,
    CURRENCY_ID: 'KGS',
    ACTIVE: product.productStatus === 'for_sale' ? 'Y' : 'N',
    DESCRIPTION: product.description || '',
    DESCRIPTION_TYPE: 'text',
  };

  if (product.sku) fields.CODE = product.sku;

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
    fields.PREVIEW_PICTURE = imageFiles[0];
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
  downloadImageAsBase64,
  CATALOG_ID,
};
