// Запуск нового товара — общая логика для роутов: создание карточки и уведомления по этапам.
const ProductLaunch = require('../models/ProductLaunch');
const User = require('../models/User');
const { sendTelegramMessage } = require('./telegram');

const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';

const PL_STAGES = ['content', 'design', 'published', 'feedback', 'done'];
const PL_STAGE_LABEL = {
  content:   'Контент',
  design:    'Дизайн',
  published: 'Опубликовано',
  feedback:  'Обратная связь',
  done:      'Завершён',
};

// Доску ведёт контент-менеджер (Зайнагуль) и редакция; дизайнеры работают на своём этапе.
const isContentManager = u => u?.role === 'owner' || u?.role === 'editor' || !!u?.canManageContent;
const isDesignerUser   = u => u?.role === 'designer';

// Карточка запуска на товар одна: повторный вызов ничего не создаёт.
async function ensureLaunch(product, user, extra = {}) {
  const existing = await ProductLaunch.findOne({ product: product._id });
  if (existing) return { launch: existing, created: false };

  const last = await ProductLaunch.findOne().sort({ number: -1 }).select('number');
  const launch = await ProductLaunch.create({
    number:        (last?.number || 0) + 1,
    product:       product._id,
    productName:   product.fullName || product.name || '',
    sku:           product.sku || '',
    image:         product.images?.[0] || '',
    request:       extra.request || undefined,
    stage:         'content',
    createdBy:     user?._id,
    createdByName: user?.name || '',
  });
  return { launch, created: true };
}

// Кого дёргаем на этапе: дизайн — дизайнеров, остальное — тех, кто ведёт контент.
async function recipientsForStage(stage) {
  const filter = stage === 'design'
    ? { role: 'designer' }
    : { $or: [{ canManageContent: true }, { role: 'editor' }] };
  return User.find({ ...filter, telegramChatId: { $nin: ['', null] } })
    .select('telegramChatId name').lean();
}

const STAGE_TEXT = {
  content:   l => `🚀 <b>Новый товар в работе</b> №${l.number}\n${l.productName}\n\nЭтап: <b>Контент</b> — нужны фото, ссылка на источник и описание.`,
  design:    l => `🎨 <b>Товар готов к дизайну</b> №${l.number}\n${l.productName}\n\n` +
                  (l.content?.sourceUrl ? `Источник: ${l.content.sourceUrl}\n` : '') +
                  (l.content?.description ? `Описание: ${l.content.description}\n` : '') +
                  `Фото: ${l.content?.photos?.length || 0} шт.`,
  published: l => `📣 <b>Пост вышел</b> №${l.number}\n${l.productName}\n\nЧерез несколько дней внесите результат: обращения, реакции, комментарии, заказы.`,
  feedback:  l => `📊 <b>Пора собрать результат поста</b> №${l.number}\n${l.productName}`,
  done:      l => `✅ <b>Запуск завершён</b> №${l.number}\n${l.productName}`,
};

async function notifyStage(launch, stage) {
  try {
    const build = STAGE_TEXT[stage];
    if (!build) return;
    const users = await recipientsForStage(stage);
    if (!users.length) return;
    const text = `${build(launch)}\n\n${SITE_URL}/admin/pending-receive`;
    for (const u of users) await sendTelegramMessage(u.telegramChatId, text);
  } catch (e) {
    console.error('[product-launch] telegram notify failed:', e.message);
  }
}

module.exports = { PL_STAGES, PL_STAGE_LABEL, isContentManager, isDesignerUser, ensureLaunch, notifyStage };
