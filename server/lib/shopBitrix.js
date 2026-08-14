/**
 * Заявка из Telegram-магазина → сделка в Битрикс24.
 *
 * Воронка «matkasym_home (сделки менеджеров розничные продажи)», стадия «Новая (взят в работу)».
 * Ключи вынесены в переменные окружения: воронки в портале переименовывают и пересобирают,
 * а перевыкладывать код из-за этого не хочется.
 *
 * Всё, что делается сверх самой сделки (поиск контакта по телефону, привязка товара
 * из каталога Битрикса), — по возможности: если какой-то из этих вызовов упадёт,
 * заявка всё равно должна долететь до менеджера.
 */
const { call, getProductByXmlId } = require('../utils/bitrix24');

const CATEGORY_ID = process.env.BITRIX_SHOP_CATEGORY_ID || '49';
const STAGE_ID    = process.env.BITRIX_SHOP_STAGE_ID    || 'C49:NEW';

// Телефон для поиска дубля: в Битриксе он записан как угодно («+996 555 …», «0555…»),
// значимы только цифры, а у кыргызских номеров — последние 9.
const phoneTail = phone => String(phone || '').replace(/\D/g, '').slice(-9);

async function findContactByPhone(phone) {
  const tail = phoneTail(phone);
  if (tail.length < 9) return null;
  const res = await call('crm.duplicate.findbycomm', {
    entity_type: 'CONTACT',
    type:        'PHONE',
    values:      [tail],
  });
  return res?.CONTACT?.[0] || null;
}

async function createContact({ name, phone, tgUsername }) {
  return call('crm.contact.add', {
    fields: {
      NAME:    name || 'Клиент из Telegram',
      COMMENTS: tgUsername ? `Telegram: @${tgUsername}` : 'Заявка из Telegram-магазина',
      PHONE:   phone ? [{ VALUE: phone, VALUE_TYPE: 'MOBILE' }] : [],
      SOURCE_DESCRIPTION: 'Telegram-магазин MATKASYM',
      OPENED:  'Y',
    },
    params: { REGISTER_SONET_EVENT: 'N' },
  });
}

// Контакт нужен, чтобы менеджеру было кому звонить прямо из карточки сделки.
// Тот же человек мог обращаться раньше — сначала ищем по телефону, потом создаём.
async function ensureContact({ name, phone, tgUsername }) {
  if (!phone) return null;
  try {
    const found = await findContactByPhone(phone);
    if (found) return found.ID;
    return await createContact({ name, phone, tgUsername });
  } catch (e) {
    console.error('[shopBitrix] контакт не создан:', e.message);
    return null;
  }
}

// Товар из каталога Битрикса. Синхронизация каталога кладёт в XML_ID id товара сайта —
// по нему сделка получает настоящую товарную позицию, а не только текст в комментарии.
async function attachProduct(dealId, product, qty, price) {
  try {
    const bx = await getProductByXmlId(String(product._id));
    if (!bx) return false;
    await call('crm.deal.productrows.set', {
      id: dealId,
      rows: [{ PRODUCT_ID: bx.ID, PRICE: price, QUANTITY: qty }],
    });
    return true;
  } catch (e) {
    console.error('[shopBitrix] товарная позиция не добавлена:', e.message);
    return false;
  }
}

function dealComments({ product, request, tgUser }) {
  const site = process.env.SITE_URL || process.env.CLIENT_URL || 'https://matkasym-site.onrender.com';
  const lines = [
    'Заявка «Уточнить наличие» из Telegram-магазина.',
    '',
    `Товар: ${request.snapshot.name}`,
    request.snapshot.sku ? `Артикул: ${request.snapshot.sku}` : '',
    `Количество: ${request.qty}`,
    `Цена в приложении: ${request.snapshot.price} сом`,
    `Остаток на момент заявки: ${request.snapshot.stock} шт.`,
    '',
    `Клиент: ${request.customer.name || tgUser?.name || '—'}`,
    `Телефон: ${request.customer.phone || '—'}`,
    tgUser?.username ? `Telegram: @${tgUser.username} (https://t.me/${tgUser.username})` : `Telegram id: ${tgUser?.id || '—'}`,
    request.comment ? `Комментарий: ${request.comment}` : '',
    '',
    `Карточка товара: ${site}/admin/products/${product._id}`,
  ];
  return lines.filter(l => l !== '').join('\n');
}

/**
 * Создаёт сделку по заявке. Возвращает { dealId } либо { error } —
 * заявка сохраняется в любом случае, поэтому исключение наружу не бросаем.
 */
async function createShopDeal({ request, product, tgUser }) {
  try {
    const contactId = await ensureContact({
      name:       request.customer.name,
      phone:      request.customer.phone,
      tgUsername: tgUser?.username,
    });

    const price = Number(request.snapshot.price) || 0;
    const dealId = await call('crm.deal.add', {
      fields: {
        TITLE:       `TG-магазин: ${request.snapshot.name}${request.qty > 1 ? ` × ${request.qty}` : ''}`,
        CATEGORY_ID,
        STAGE_ID,
        OPPORTUNITY: price * (request.qty || 1),
        CURRENCY_ID: 'KGS',
        COMMENTS:    dealComments({ product, request, tgUser }),
        ...(contactId ? { CONTACT_ID: contactId } : {}),
        OPENED:      'Y',
      },
      params: { REGISTER_SONET_EVENT: 'Y' },
    });

    if (dealId && price > 0) await attachProduct(dealId, product, request.qty || 1, price);

    return { dealId: String(dealId) };
  } catch (e) {
    console.error('[shopBitrix] сделка не создана:', e.message);
    return { error: e.message };
  }
}

module.exports = { createShopDeal, ensureContact, CATEGORY_ID, STAGE_ID };
