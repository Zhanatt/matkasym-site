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
  const first = Array.isArray(d.result) ? d.result[0] : null;
  return { ok: true, externalId: first ? String(first.message_id) : '' };
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

module.exports = { publish, CAPTION_LIMIT };
