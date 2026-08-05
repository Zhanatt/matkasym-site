const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';

const NEWS_TYPE_LABELS = {
  discontinued:          '🚫 Снят с производства',
  liquidation:              '📦 Ликвидация',
  out_of_stock:          '❌ Нет в наличии',
  restocked:             '✅ Появился на складе',
  price_change:          '💰 Изменение цены',
  custom:                '📢 Объявление',
  new_product:           '🆕 Новый товар',
  status_planned:        '📋 В планах',
  status_in_development: '🔧 В разработке',
  status_improvement:    '⚡ На улучшении',
  status_for_sale:       '🛒 В продаже',
};

async function sendTelegramMessage(chatId, text, options = {}) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[Telegram] No bot token configured');
    return null;
  }
  if (!chatId) {
    console.log('[Telegram] No chatId provided');
    return null;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: options.disablePreview ?? false,
        ...options,
      }),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`[Telegram] Error sending to ${chatId}:`, data.description);
      return null;
    }
    console.log(`[Telegram] ✓ Sent to ${chatId}`);
    return data;
  } catch (e) {
    console.error(`[Telegram] ✗ Failed to send to ${chatId}:`, e.message);
    return null;
  }
}

// Обрезка подписи под лимит Telegram без разрыва HTML-тега:
// слепой slice мог разрезать <a href="..."> посередине и уронить парсинг.
// Лимит считается по видимому тексту (Telegram: «after entities parsing»),
// поэтому режем только реально длинные подписи.
function clampCaption(caption) {
  const s = String(caption || '');
  const visible = s.replace(/<[^>]+>/g, '').length;
  if (visible <= 1024) return s;
  let cut = s.slice(0, 1024);
  const lastOpen = cut.lastIndexOf('<');
  if (lastOpen > cut.lastIndexOf('>')) cut = cut.slice(0, lastOpen);
  return cut.replace(/<a\s[^>]*>(?![\s\S]*<\/a>)/, '');
}

// Telegram не принимает фото больше 5 МБ по URL, а исходники товаров лежат в Cloudinary
// как PNG по 5–6 МБ: альбом падал с «wrong type of the web page content», а фолбэк
// докачивал мегабайты байтами — отсюда пятиминутная публикация. Просим Cloudinary отдать
// ужатый JPEG: те же 6 МБ превращаются в ~250 КБ.
const TG_TRANSFORM = 'f_jpg,q_auto:good,w_1600,c_limit';
function tgImage(url) {
  const s = String(url || '');
  const m = s.match(/^(.*\/image\/upload\/)(.+)$/);
  if (!m || !/res\.cloudinary\.com/.test(s)) return s;
  const parts = m[2].split('/');
  // Свою трансформацию ставим ПОСЛЕ уже имеющихся (кроп из редактора), но перед версией,
  // иначе чужие координаты кропа посчитаются от уже уменьшенной картинки.
  let i = 0;
  while (i < parts.length && /^[a-z]{1,3}_[^/]+/.test(parts[i]) && !/^v\d+$/.test(parts[i])) i++;
  if (parts.slice(0, i).some(p => p.includes('f_jpg'))) return s;   // уже ужато
  parts.splice(i, 0, TG_TRANSFORM);
  return m[1] + parts.join('/');
}

async function sendTelegramPhoto(chatId, photoUrl, caption) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return null;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: clampCaption(caption),
        parse_mode: 'HTML',
      }),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`[Telegram] Error sending photo to ${chatId}:`, data.description);
      return null;
    }
    console.log(`[Telegram] ✓ Photo sent to ${chatId}`);
    return data;
  } catch (e) {
    console.error(`[Telegram] ✗ Failed to send photo to ${chatId}:`, e.message);
    return null;
  }
}

// Альбом из нескольких фото (sendMediaGroup). Подпись кладётся на первую картинку,
// иначе Telegram покажет альбом вообще без текста. Больше 10 фото API не принимает.
async function sendTelegramAlbum(chatId, images, caption) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return null;
  const list = (images || []).slice(0, 10);
  if (list.length < 2) return null;

  try {
    const media = list.map((url, i) => ({
      type: 'photo',
      media: tgImage(url),
      ...(i === 0 ? { caption: clampCaption(caption), parse_mode: 'HTML' } : {}),
    }));
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMediaGroup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, media }),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`[Telegram] Error sending album to ${chatId}:`, data.description);
      return null;
    }
    console.log(`[Telegram] ✓ Album (${list.length} photos) sent to ${chatId}`);
    return data;
  } catch (e) {
    console.error(`[Telegram] ✗ Failed to send album to ${chatId}:`, e.message);
    return null;
  }
}

// Публикация поста в произвольный чат: канал, группу или личку.
// Бот должен быть в чате и иметь право писать. Возвращает { ok, error } — ошибка идёт в UI.
// Картинку по возможности заливаем байтами (multipart), а не URL-ом: так надёжнее,
// потому что Telegram сам не всегда может скачать Google Drive / приватные ссылки.
async function publishToChat({ chatId, photoUrl, caption }) {
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, error: 'TELEGRAM_BOT_TOKEN не настроен на сервере' };
  if (!chatId)          return { ok: false, error: 'Не указан чат для публикации' };

  const api = (method) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
  const text = String(caption || '');

  if (photoUrl) {
    // 1) пробуем скачать картинку и отправить её байтами
    try {
      const imgResp = await fetch(tgImage(photoUrl));
      if (imgResp.ok) {
        const buf = Buffer.from(await imgResp.arrayBuffer());
        const form = new FormData();
        form.append('chat_id', String(chatId));
        form.append('caption', clampCaption(text));
        form.append('parse_mode', 'HTML');
        form.append('photo', new Blob([buf], { type: imgResp.headers.get('content-type') || 'image/jpeg' }), 'photo.jpg');
        const r = await fetch(api('sendPhoto'), { method: 'POST', body: form });
        const d = await r.json();
        if (d.ok) return { ok: true, data: d };
        console.error('[Telegram] channel sendPhoto (bytes) failed:', d.description);
        // не выходим — пробуем отправить по URL ниже
      }
    } catch (e) {
      console.error('[Telegram] channel image fetch failed:', e.message);
    }
    // 2) fallback: отдаём Telegram сам URL
    const r = await fetch(api('sendPhoto'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: tgImage(photoUrl), caption: clampCaption(text), parse_mode: 'HTML' }),
    });
    const d = await r.json();
    return d.ok ? { ok: true, data: d } : { ok: false, error: d.description };
  }

  // без фото — обычное сообщение
  const r = await fetch(api('sendMessage'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096), parse_mode: 'HTML', disable_web_page_preview: false }),
  });
  const d = await r.json();
  return d.ok ? { ok: true, data: d } : { ok: false, error: d.description };
}

async function sendNewsNotificationTelegram({ type, title, message, product }, recipients) {
  const typeLabel = NEWS_TYPE_LABELS[type] || '📢 Новость';
  const productName = product?.fullName || product?.name || '';
  const productStock = product?.stock;

  let text = `<b>${typeLabel}</b>\n\n`;
  text += `<b>${title}</b>\n`;

  if (productName) {
    text += `\n📦 <b>${productName}</b>`;
    if (product?.inTransit) {
      text += `\n🚚 <b>Товар в пути</b> — ещё не на складе`;
    } else if (productStock != null) {
      text += `\nОстаток: ${productStock} шт.`;
    }
  }

  if (message) {
    text += `\n\n${message}`;
  }

  text += `\n\n<a href="${SITE_URL}/admin/news">Открыть в матрице →</a>`;

  // Все фото товара, а не только обложка: раньше уходила одна первая картинка,
  // и по уведомлению нельзя было понять, как товар выглядит с других сторон.
  const photos = (product?.images || []).filter(img => img && img.startsWith('http')).slice(0, 10);
  const photoUrl = photos[0] || null;

  const recipientsList = Array.isArray(recipients) ? recipients : [recipients];
  console.log(`[Telegram] Sending news "${title}" to ${recipientsList.length} recipients`);

  for (const r of recipientsList) {
    const chatId = r.telegramChatId;
    if (!chatId) {
      console.log(`[Telegram] Skipping ${r.name || r.email} — no telegramChatId`);
      continue;
    }
    // Несколько фото — альбомом; если альбом не прошёл (недоступная картинка,
    // лимиты), откатываемся на одну обложку, а в крайнем случае — на текст.
    let sent = photos.length > 1 ? await sendTelegramAlbum(chatId, photos, text) : null;
    if (!sent && photoUrl) sent = await sendTelegramPhoto(chatId, photoUrl, text);
    if (!sent) await sendTelegramMessage(chatId, text);
  }
}

async function sendAuditNotificationTelegram({ auditName, deadline }, recipients) {
  const deadlineStr = new Date(deadline).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });

  let text = `<b>📋 Объявлен новый аудит!</b>\n\n`;
  text += `<b>${auditName}</b>\n\n`;
  text += `⏰ Срок: <b>${deadlineStr}</b>\n\n`;
  text += `Пожалуйста, пройдите аудит товаров в ваших сетах до указанного срока.\n\n`;
  text += `<a href="${SITE_URL}/admin/review">Начать аудит →</a>`;

  const recipientsList = Array.isArray(recipients) ? recipients : [recipients];
  console.log(`[Telegram] Sending audit notification to ${recipientsList.length} frontmen`);

  for (const r of recipientsList) {
    const chatId = r.telegramChatId;
    if (!chatId) {
      console.log(`[Telegram] Skipping ${r.name || r.email} — no telegramChatId`);
      continue;
    }
    await sendTelegramMessage(chatId, text);
  }
}

// Уведомление о падении остатка ниже буферного запаса.
// alerts: [{ name, sku, stock, bufferStock, zone }] — каждому получателю уходят только товары его зоны.
async function sendBufferStockAlerts(alerts) {
  if (!alerts || !alerts.length) return;
  const User = require('../models/User');
  const recipients = await User.find({
    bufferZone:     { $in: ['ikea', 'home', 'shaar'] },
    telegramChatId: { $nin: ['', null] },
  });
  if (!recipients.length) {
    console.log('[Telegram] Buffer alert: no recipients with telegram connected');
    return;
  }

  for (const r of recipients) {
    const mine = alerts.filter(a => a.zone === r.bufferZone);
    if (!mine.length) continue;

    let text = `<b>⚠️ Остаток ниже буферного запаса!</b>\n\n`;
    for (const a of mine.slice(0, 25)) {
      text += `📦 <b>${a.name}</b>${a.sku ? ` (${a.sku})` : ''}\n`;
      text += `Остаток: <b>${a.stock} шт.</b> — буфер: ${a.bufferStock} шт.\n\n`;
    }
    if (mine.length > 25) text += `…и ещё ${mine.length - 25} товаров\n\n`;
    text += `<a href="${SITE_URL}/admin/buffer-stock">Открыть список →</a>`;

    console.log(`[Telegram] Buffer alert → ${r.name || r.email} (zone=${r.bufferZone}, ${mine.length} products)`);
    await sendTelegramMessage(r.telegramChatId, text, { disablePreview: true });
  }
}

module.exports = { sendTelegramMessage, sendTelegramPhoto, sendTelegramAlbum, sendNewsNotificationTelegram, sendAuditNotificationTelegram, sendBufferStockAlerts, publishToChat, tgImage };
