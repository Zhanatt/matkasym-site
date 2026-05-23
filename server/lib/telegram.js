const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';

const NEWS_TYPE_LABELS = {
  discontinued:          '🚫 Снят с производства',
  nelikvid:              '📦 Неликвид',
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

async function sendNewsNotificationTelegram({ type, title, message, product }, recipients) {
  const typeLabel = NEWS_TYPE_LABELS[type] || '📢 Новость';
  const productName = product?.fullName || product?.name || '';
  const productStock = product?.stock;

  let text = `<b>${typeLabel}</b>\n\n`;
  text += `<b>${title}</b>\n`;

  if (productName) {
    text += `\n📦 <b>${productName}</b>`;
    if (productStock != null) {
      text += `\nОстаток: ${productStock} шт.`;
    }
  }

  if (message) {
    text += `\n\n${message}`;
  }

  text += `\n\n<a href="${SITE_URL}/admin/news">Открыть в матрице →</a>`;

  const recipientsList = Array.isArray(recipients) ? recipients : [recipients];
  console.log(`[Telegram] Sending news "${title}" to ${recipientsList.length} recipients`);

  for (const r of recipientsList) {
    const chatId = r.telegramChatId;
    if (!chatId) {
      console.log(`[Telegram] Skipping ${r.name || r.email} — no telegramChatId`);
      continue;
    }
    await sendTelegramMessage(chatId, text);
  }
}

module.exports = { sendTelegramMessage, sendNewsNotificationTelegram };
