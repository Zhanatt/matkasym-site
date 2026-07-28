// Публикация в Telegram-группу / канал. Бот — тот же (TELEGRAM_BOT_TOKEN),
// адрес берётся из настроек площадки (config.chatId), а не из env: групп может быть несколько.
const { publishToChat } = require('../telegram');

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;

// Telegram режет подпись к фото на 1024 символах, обычное сообщение — на 4096.
const CAPTION_LIMIT = 1024;

// Несколько картинок — альбомом (sendMediaGroup). Подпись кладётся на первую,
// иначе Telegram покажет альбом без текста.
async function sendAlbum(chatId, images, caption) {
  const media = images.slice(0, 10).map((url, i) => ({
    type: 'photo',
    media: url,
    ...(i === 0 ? { caption: caption.slice(0, CAPTION_LIMIT), parse_mode: 'HTML' } : {}),
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

  if (images.length > 1) {
    const album = await sendAlbum(chatId, images, caption);
    if (album.ok) return album;
    // Альбом мог не пройти из-за недоступной для Telegram картинки —
    // тогда отправляем одну обложку байтами (publishToChat умеет это сам).
  }

  const res = await publishToChat({ chatId, photoUrl: images[0] || null, caption });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, externalId: res.data?.result?.message_id ? String(res.data.result.message_id) : '' };
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

module.exports = { publish, unpublish, CAPTION_LIMIT };
