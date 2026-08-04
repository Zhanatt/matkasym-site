// Тестовая продажа нового товара — общая логика для роутов: нумерация карточек и уведомления по этапам.
const ProductLaunch = require('../models/ProductLaunch');
const User = require('../models/User');
const { sendTelegramMessage } = require('./telegram');

const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';

const PL_STAGES = ['content', 'design', 'published', 'target', 'feedback', 'done'];
const PL_STAGE_LABEL = {
  content:   'Контент',
  design:    'Дизайн',
  published: 'Опубликовано',
  target:    'Таргет',
  feedback:  'Обратная связь',
  done:      'Завершён',
};

// Доску ведёт контент-менеджер (Зайнагуль) и редакция; дизайнеры работают на своём этапе.
const isContentManager = u => u?.role === 'owner' || u?.role === 'editor' || !!u?.canManageContent;
const isDesignerUser   = u => u?.role === 'designer';
// Таргетолог получает задачу на рекламу и заполняет её результат
const isAdsManager     = u => !!u?.canRunAds;

// Сквозная нумерация карточек — по ней товар зовут в переписке, пока у него нет артикула
async function nextNumber() {
  const last = await ProductLaunch.findOne().sort({ number: -1 }).select('number');
  return (last?.number || 0) + 1;
}

// Кого дёргаем на этапе: дизайн — дизайнеров, таргет — только таргетолога,
// остальное — тех, кто ведёт контент.
async function recipientsForStage(stage) {
  const filter = stage === 'design' ? { role: 'designer' }
               : stage === 'target' ? { canRunAds: true }
               : { $or: [{ canManageContent: true }, { role: 'editor' }] };
  return User.find({ ...filter, telegramChatId: { $nin: ['', null] } })
    .select('telegramChatId name').lean();
}

const STAGE_TEXT = {
  content:   l => `🧪 <b>Новый товар на тест</b> №${l.number}\n${l.name}\n\nЭтап: <b>Контент</b> — нужны фото, ссылка на источник и описание.`,
  design:    l => `🎨 <b>Товар готов к дизайну</b> №${l.number}\n${l.name}\n\n` +
                  (l.content?.sourceUrl ? `Источник: ${l.content.sourceUrl}\n` : '') +
                  (l.content?.description ? `Описание: ${l.content.description}\n` : '') +
                  `Фото: ${l.content?.photos?.length || 0} шт.`,
  published: l => `📣 <b>Пост вышел, идёт тестовая продажа</b> №${l.number}\n${l.name}\n\nСобираем отклик: обращения, реакции, комментарии, заявки клиентов.`,
  // Задача таргетологу: важно, чтобы он понимал — товара на складе нет, это проверка спроса
  target:    l => `🎯 <b>Задача: запустить таргет</b> №${l.number}\n` +
                  `Товар: <b>${l.name}</b>\n\n` +
                  `⚠️ Это <b>тестовый продукт</b> — на складе его нет. Продаём по фото и смотрим, ` +
                  `сколько будет обращений и заявок.\n\n` +
                  (l.content?.description ? `Описание: ${l.content.description}\n` : '') +
                  (l.publish?.links?.length
                    ? `Посты:\n${l.publish.links.map(x => `• ${x.platform || 'пост'}: ${x.url}`).join('\n')}\n`
                    : '') +
                  (l.target?.note ? `\nОт команды: ${l.target.note}\n` : '') +
                  `\nПосле открутки заполните результат: обращения, реакции, комментарии, заявки клиентов и вывод.`,
  feedback:  l => `📊 <b>Пора подвести итог тестовой продажи</b> №${l.number}\n${l.name}`,
  done:      l => `✅ <b>Тестовая продажа закрыта</b> №${l.number}\n${l.name}`,
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

module.exports = { PL_STAGES, PL_STAGE_LABEL, isContentManager, isDesignerUser, isAdsManager, nextNumber, notifyStage };
