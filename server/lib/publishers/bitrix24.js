// Публикация в живую ленту Битрикс24 (log.blogpost.add) через тот же вебхук,
// что и синхронизация каталога — server/utils/bitrix24.js.
//
// account.config = { dest }  — кому виден пост: 'UA' = вся компания (по умолчанию),
//                              'SGn' = рабочая группа, 'Un' = конкретный сотрудник.
const { call } = require('../../utils/bitrix24');

// Лента понимает BBCode, а шаблоны у нас в HTML (общие с Telegram) — переводим.
function htmlToBBCode(text) {
  return String(text || '')
    .replace(/<b>(.*?)<\/b>/gis, '[B]$1[/B]')
    .replace(/<i>(.*?)<\/i>/gis, '[I]$1[/I]')
    .replace(/<a href="(.*?)">(.*?)<\/a>/gis, '[URL=$1]$2[/URL]')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

// Тяжёлый оригинал в ленте не нужен — просим Cloudinary отдать копию поменьше.
function compressed(url) {
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  return url.replace('/image/upload/', '/image/upload/f_jpg,q_auto,w_1200,c_limit/');
}

// Заголовок поста: первая непустая строка текста, без разметки.
function pickTitle(text) {
  const first = htmlToBBCode(text).split('\n').map(s => s.trim()).find(Boolean) || 'Новость';
  return first.slice(0, 100);
}

async function publish({ account, caption, images }) {
  try {
    const dest = account?.config?.dest || 'UA';

    let message = htmlToBBCode(caption);
    // Картинки — BBCode-тегами в теле поста: заливка файлов через вебхук требует
    // отдельных прав, а [IMG] по публичной ссылке Cloudinary работает всегда.
    for (const url of images.slice(0, 10)) {
      message += `\n[IMG]${compressed(url)}[/IMG]`;
    }

    const id = await call('log.blogpost.add', {
      POST_TITLE:   pickTitle(caption),
      POST_MESSAGE: message,
      DEST:         [dest],
    });

    return { ok: true, externalId: String(id || '') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { publish, htmlToBBCode };
