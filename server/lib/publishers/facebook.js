// Публикация на страницу Facebook через Meta Graph API.
//
// Картинку Facebook, как и Instagram, скачивает САМ по ссылке — URL обязан быть
// публичным. Cloudinary подходит, приватные Drive-ссылки — нет.
//
// Три разных вызова в зависимости от числа картинок:
//   нет картинок  → POST /{pageId}/feed    { message }
//   одна          → POST /{pageId}/photos  { url, caption }
//   несколько     → каждую заливаем как published=false, затем один пост
//                   POST /{pageId}/feed с attached_media[i]={"media_fbid":…}
// Отдельного «альбома» не делаем: attached_media даёт обычный пост с галереей,
// как если бы его выложили руками.
//
// account.config = { pageId, accessToken, pageName }
// Токен — ТОКЕНА СТРАНИЦЫ (GET /me/accounts), с правом pages_manage_posts:
// пользовательский токен Meta не пропустит, а без pages_manage_posts вернёт (#200).
const { htmlToPlain, adaptCaption } = require('../postCaption');

const GRAPH = 'https://graph.facebook.com/v21.0';

// Оригиналы по 5–6 МБ Meta качает долго и иногда отваливается по таймауту.
// Просим у Cloudinary копию поменьше — как в telegram.js и bitrix24.js.
function compressed(url) {
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  return url.replace('/image/upload/', '/image/upload/f_jpg,q_auto:good,w_1600,c_limit/');
}

async function graph(path, params, method = 'POST') {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => body.append(k, String(v)));

  // Тело принимает только POST: у GET и DELETE параметры уходят в query,
  // иначе Graph отвечает «Unsupported request».
  const r = method === 'POST'
    ? await fetch(`${GRAPH}${path}`, { method: 'POST', body })
    : await fetch(`${GRAPH}${path}?${body.toString()}`, { method });

  const d = await r.json().catch(() => ({}));
  if (d.error) {
    const e = new Error(d.error.error_user_msg || d.error.message || 'Facebook API error');
    e.code = d.error.code;
    throw e;
  }
  return d;
}

async function publish({ account, caption: rawCaption, images = [], postType = 'feed', publication }) {
  const { pageId, accessToken } = account?.config || {};
  if (!pageId || !accessToken) return { ok: false, error: 'Не заданы pageId / accessToken' };

  // Историй у страниц через API нет (photo_stories — только для приложений
  // с отдельным доступом), поэтому честно говорим, а не падаем на публикации.
  if (postType === 'story') {
    return { ok: false, error: 'Facebook: истории через API не публикуются — только обычный пост' };
  }

  // Facebook не рендерит HTML: разметка ушла бы в текст буквально.
  // adaptCaption — страховка: убирает ссылку на WhatsApp, ставит призыв писать
  // в Direct и хэштеги даже у публикаций, созданных до этих правил.
  // Цену оставляет только у товаров IKEA, поэтому ему и нужен product.
  const message = htmlToPlain(adaptCaption(rawCaption, 'facebook', null, publication?.product));
  if (!message.trim() && !images.length) {
    return { ok: false, error: 'Пустой пост: нет ни текста, ни картинки' };
  }

  try {
    let externalId;

    if (!images.length) {
      const d = await graph(`/${pageId}/feed`, { message, access_token: accessToken });
      externalId = d.id;
    } else if (images.length === 1) {
      // caption у /photos — это и есть текст поста.
      const d = await graph(`/${pageId}/photos`, {
        url: compressed(images[0]),
        caption: message,
        access_token: accessToken,
      });
      externalId = d.post_id || d.id;
    } else {
      // Заливаем скрытыми, иначе каждая картинка стала бы отдельным постом в ленте.
      const fbids = [];
      for (const url of images.slice(0, 10)) {
        const p = await graph(`/${pageId}/photos`, {
          url: compressed(url),
          published: 'false',
          access_token: accessToken,
        });
        fbids.push(p.id);
      }
      const params = { message, access_token: accessToken };
      fbids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
      const d = await graph(`/${pageId}/feed`, params);
      externalId = d.id;
    }

    return {
      ok: true,
      externalId: String(externalId || ''),
      externalUrl: externalId ? `https://www.facebook.com/${externalId}` : '',
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Отклик на пост ───────────────────────────────────────────────────────────
//
// Как и в Instagram, источника два и они независимы:
//   · счётчики самого поста (реакции, комментарии, репосты) — отдаются по
//     pages_read_engagement, то есть тем же токеном, которым мы публикуем;
//   · insights (показы, охват, клики) — только с правом read_insights.
// Без второго отчёт всё равно осмысленный, поэтому счётчики тянем отдельно.
//
// Набор метрик у страниц Meta переписывала не раз, и на неизвестное имя приходит
// не «нет такого поля», а ошибка на весь запрос. Спрашиваем оптимистично и на
// отказ выкидываем названные метрики — новые подхватятся сами.
const POST_FIELDS  = 'reactions.summary(true).limit(0),comments.summary(true).limit(0),shares';
const POST_METRICS = ['post_impressions', 'post_impressions_unique', 'post_clicks'];

// Ключи Meta → поля отчёта. Реакции считаем отдельно от лайков Instagram:
// в Facebook это лайк, сердце, «ха-ха» и остальные — в сумме.
const METRIC_FIELD = {
  post_impressions: 'views', post_impressions_unique: 'reach', post_clicks: 'clicks',
};

// «(#100) The value must be a valid insights metric» страница отдаёт и тогда,
// когда метрика реально снята с поддержки, и когда у токена нет read_insights —
// различить нельзя, поэтому подсказываем самое вероятное.
function explainStatsError(msg) {
  const text = String(msg || '');
  if (/does not exist|cannot be loaded|Unsupported get request/i.test(text)) {
    return 'Facebook не отдаёт этот пост: обычно так бывает, если его удалили со страницы.';
  }
  if (/valid insights metric|#100/i.test(text)) {
    return 'Показы и охват страница не отдала: чаще всего токену не хватает права read_insights — '
      + 'добавьте его и перевыпустите токен страницы. Реакции, комментарии и репосты считаются и без него.';
  }
  if (/expired|Session has expired|#190/i.test(text)) {
    return 'Токен истёк — выпустите новый на странице площадок.';
  }
  return text;
}

const rejectedMetrics = (message, asked) => {
  const text = String(message || '').toLowerCase();
  return asked.filter(m => text.includes(m.toLowerCase()));
};

async function fetchInsights(postId, accessToken, metrics, depth = 0) {
  if (!metrics.length || depth > 3) return {};
  try {
    const d = await graph(`/${postId}/insights`, { metric: metrics.join(','), access_token: accessToken }, 'GET');
    const out = {};
    (d.data || []).forEach(row => {
      const field = METRIC_FIELD[row.name];
      const value = row.values?.[0]?.value;
      if (field && typeof value === 'number') out[field] = value;
    });
    return out;
  } catch (e) {
    const bad = rejectedMetrics(e.message, metrics);
    if (!bad.length) throw e;
    return fetchInsights(postId, accessToken, metrics.filter(m => !bad.includes(m)), depth + 1);
  }
}

/**
 * Цифры по одному посту страницы: реакции, комментарии, репосты, показы, охват.
 * Ошибку возвращаем текстом — она ложится рядом с постом в журнале.
 */
async function stats({ account, externalId }) {
  const { accessToken } = account?.config || {};
  if (!accessToken) return { ok: false, error: 'Не задан accessToken' };
  if (!externalId)  return { ok: false, error: 'У поста нет id на площадке' };

  const out = {};
  const notes = [];

  try {
    const d = await graph(`/${externalId}`, { fields: POST_FIELDS, access_token: accessToken }, 'GET');
    if (typeof d.reactions?.summary?.total_count === 'number') out.reactions = d.reactions.summary.total_count;
    if (typeof d.comments?.summary?.total_count === 'number')  out.comments  = d.comments.summary.total_count;
    // Репостов может не быть вовсе — тогда Facebook поля не присылает, а не ноль
    out.shares = typeof d.shares?.count === 'number' ? d.shares.count : 0;
  } catch (e) {
    notes.push(explainStatsError(e.message));
  }

  try {
    Object.assign(out, await fetchInsights(externalId, accessToken, POST_METRICS));
  } catch (e) {
    notes.push(explainStatsError(e.message));
  }
  // Метрики отвалились по одной — до вызова дело не дошло, а показов нет
  if (!('views' in out) && !notes.length) {
    notes.push(explainStatsError('valid insights metric'));
  }

  const why = [...new Set(notes)].join('; ');
  if (!Object.keys(out).length) return { ok: false, error: why || 'Facebook не отдал ни одной цифры' };
  return { ok: true, stats: out, warning: why };
}

// Facebook, в отличие от Instagram, удалять посты через API умеет.
async function unpublish({ account, externalId }) {
  const { accessToken } = account?.config || {};
  if (!externalId) return { ok: false, manual: true, error: 'Не сохранён id поста — удалите вручную' };
  if (!accessToken) return { ok: false, manual: true, error: 'Не задан accessToken' };

  try {
    await graph(`/${externalId}`, { access_token: accessToken }, 'DELETE');
    return { ok: true };
  } catch (e) {
    // Пост могли снять руками раньше — для нас это не ошибка.
    if (/does not exist|Unsupported get request/i.test(e.message)) return { ok: true };
    return { ok: false, error: e.message, manual: true };
  }
}

module.exports = { publish, unpublish, stats, compressed };
