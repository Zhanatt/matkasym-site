// Публикация в Telegram-группу / канал. Бот — тот же (TELEGRAM_BOT_TOKEN),
// адрес берётся из настроек площадки (config.chatId), а не из env: групп может быть несколько.
const { publishToChat, tgImage, clampCaption, getChatInfo, fetchPostViews } = require('../telegram');

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;

// Ответы Bot API читают не программисты, а контентщики — переводим на человеческий.
function explain(desc) {
  const d = String(desc || '');
  if (/can't parse entities|can't find end tag/i.test(d)) {
    return 'поломана разметка в тексте поста (непарный тег) — обычно так бывает, '
         + 'когда при ручной правке задели ссылку «Заказать в WhatsApp»; сгенерируйте текст заново';
  }
  if (/wrong type of the web page content|failed to get HTTP URL content|WEBPAGE_(CURL|MEDIA)_EMPTY/i.test(d)) {
    return `Telegram не смог скачать картинку (${d}) — возможно, фото удалено из Cloudinary`;
  }
  return d;
}

// Несколько картинок — альбомом (sendMediaGroup). Подпись кладётся на первую,
// иначе Telegram покажет альбом без текста. Лимит подписи (1024) Telegram считает
// по ВИДИМОМУ тексту — обрезаем через clampCaption, а не срезом по сырому HTML:
// срез попадал внутрь href кнопки заказа, альбом падал, и пост уходил одной фоткой.
async function sendAlbum(chatId, images, caption) {
  const media = images.slice(0, 10).map((url, i) => ({
    type: 'photo',
    // Ужатая версия: исходные PNG по 5–6 МБ Telegram по URL не принимает
    media: tgImage(url),
    ...(i === 0 ? { caption: clampCaption(caption), parse_mode: 'HTML' } : {}),
  }));
  const r = await fetch(`https://api.telegram.org/bot${TOKEN()}/sendMediaGroup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, media }),
  });
  const d = await r.json();
  if (!d.ok) return { ok: false, error: d.description };
  // Альбом — это N отдельных сообщений. Запоминаем ВСЕ id: чтобы потом удалить пост
  // целиком, каждое придётся удалять своим вызовом deleteMessage.
  const ids = (Array.isArray(d.result) ? d.result : []).map(m => m.message_id).filter(Boolean);
  return { ok: true, externalId: ids.join(',') };
}

// account.config = { chatId }
async function publish({ account, caption, images }) {
  const chatId = account?.config?.chatId;
  if (!chatId) return { ok: false, error: 'Не указан chat_id группы' };

  let albumError = '';
  if (images.length > 1) {
    const album = await sendAlbum(chatId, images, caption);
    if (album.ok) return album;
    // Альбом мог не пройти из-за недоступной для Telegram картинки —
    // тогда отправляем одну обложку байтами (publishToChat умеет это сам).
    albumError = explain(album.error) || 'неизвестная ошибка';
    console.error(`[Telegram] альбом из ${images.length} фото не прошёл:`, album.error);
  }

  const res = await publishToChat({ chatId, photoUrl: images[0] || null, caption });
  if (!res.ok) return { ok: false, error: explain(res.error) };
  return {
    ok: true,
    externalId: res.data?.result?.message_id ? String(res.data.result.message_id) : '',
    // Пост ушёл, но не тем, чем задумывали. Молчать об этом нельзя: зелёная галочка
    // «опубликовано» полгода прятала потерю фотографий.
    warning: albumError
      ? `альбом из ${images.length} фото не прошёл (${albumError}) — ушло только одно фото`
      : '',
  };
}

// Удаление поста. Бот может удалить своё сообщение только в течение 48 часов —
// это ограничение Bot API, обойти его нечем. Альбом удаляем по всем id сразу.
async function unpublish({ account, externalId }) {
  const chatId = account?.config?.chatId;
  if (!chatId)     return { ok: false, error: 'Не указан chat_id группы' };
  if (!externalId) return { ok: false, error: 'Не сохранён id сообщения — удалите вручную' };

  const ids = String(externalId).split(',').map(s => s.trim()).filter(Boolean);
  const errors = [];

  for (const id of ids) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN()}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: Number(id) }),
    });
    const d = await r.json().catch(() => ({}));
    // «message to delete not found» — сообщения уже нет, для нас это успех.
    if (!d.ok && !/not found/i.test(d.description || '')) errors.push(d.description || 'неизвестная ошибка');
  }

  if (!errors.length) return { ok: true };
  const tooOld = errors.some(e => /can't be deleted|too old/i.test(e));
  return {
    ok: false,
    error: tooOld ? 'Прошло больше 48 часов — Telegram не даёт боту удалить пост' : errors[0],
    manual: true,
  };
}

// ── Отклик на пост ───────────────────────────────────────────────────────────
//
// Telegram здесь устроен не как Meta, и границы жёсткие:
//   · просмотры есть ТОЛЬКО у каналов — в группах такого счётчика не существует;
//   · Bot API их не отдаёт вовсе, поэтому у публичного канала читаем со страницы
//     поста, а у приватного взять неоткуда;
//   · реакции запросом не получить — они приходят событиями в вебхук и копятся
//     в stats.reactions сами (см. index.js). Здесь их не трогаем: refreshStats
//     подмешивает новые цифры к старым, накопленное переживёт обновление.
async function stats({ account, externalId }) {
  const chatId = account?.config?.chatId;
  if (!chatId)     return { ok: false, error: 'Не указан chat_id' };
  if (!externalId) return { ok: false, error: 'У поста нет id сообщения' };
  if (!TOKEN())    return { ok: false, error: 'Не задан TELEGRAM_BOT_TOKEN' };

  let chat;
  try {
    chat = await getChatInfo(chatId);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  // Нечего и пытаться: это свойство самого чата, а не сбой. Помечаем skip —
  // иначе одна и та же надпись про «в группе просмотров нет» висела бы красным
  // под каждым постом, а в отчёте они считались бы постами без данных.
  if (chat.type !== 'channel') {
    return { ok: false, skip: true, error: 'В группах Telegram просмотров нет — считаются только реакции' };
  }
  if (!chat.username) {
    return { ok: false, skip: true, error: 'Просмотры Telegram отдаёт только у публичных каналов' };
  }

  // Альбом — это несколько сообщений подряд, просмотры у них общие: берём первое.
  const firstId = String(externalId).split(',')[0].trim();
  const r = await fetchPostViews(chat.username, firstId);
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, stats: { views: r.views } };
}

module.exports = { publish, unpublish, stats };
