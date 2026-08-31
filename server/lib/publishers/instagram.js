// Публикация в Instagram через Meta Graph API (IG Business/Creator аккаунт).
//
// Схема у Meta двухшаговая: сначала создаётся «контейнер» (/media), потом он публикуется
// (/media_publish). Картинку Instagram скачивает САМ по ссылке — значит URL обязан быть
// публичным и отдавать jpeg. Cloudinary подходит, приватные Drive-ссылки — нет.
//
// account.config = { igUserId, accessToken, username }
const { htmlToPlain, adaptCaption } = require('../postCaption');
const { metaError } = require('../metaError');

const GRAPH = 'https://graph.facebook.com/v21.0';

// Instagram принимает только определённые пропорции (пост 4:5…1.91:1, история 9:16)
// и падает на всём остальном. Cloudinary умеет дорисовать поля прямо в URL —
// дешевле подогнать картинку здесь, чем ловить «Media aspect ratio not supported».
// Ещё две мелочи, на которых Meta молча падает с «could not be fetched from this URI»:
// q_auto отдаёт progressive jpeg (Instagram принимает только baseline — отсюда
// fl_progressive:none), а f_jpg меняет формат, но НЕ расширение в ссылке — Meta
// получала image/jpeg по адресу с .png и спотыкалась.
function fitForInstagram(url, postType) {
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  const t = postType === 'story'
    ? 'f_jpg,fl_progressive:none,q_auto,c_pad,b_auto,ar_9:16,w_1080'
    : 'f_jpg,fl_progressive:none,q_auto,c_pad,b_auto,ar_4:5,w_1080';
  return url
    .replace('/image/upload/', `/image/upload/${t}/`)
    .replace(/\.(png|webp|avif)$/i, '.jpg');
}

async function graph(path, params, method = 'POST') {
  const url = `${GRAPH}${path}`;
  const body = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => body.append(k, Array.isArray(v) ? v.join(',') : String(v)));

  const r = method === 'GET'
    ? await fetch(`${url}?${body.toString()}`)
    : await fetch(url, { method: 'POST', body });

  const d = await r.json().catch(() => ({}));
  if (d.error) {
    const e = new Error(d.error.error_user_msg || metaError(d.error));
    e.code = d.error.code;
    throw e;
  }
  return d;
}

// Контейнер готов не мгновенно: Meta качает картинку в фоне.
// Публиковать IN_PROGRESS нельзя — ждём FINISHED (обычно 1–3 с).
async function waitReady(containerId, accessToken, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const d = await graph(`/${containerId}`, { fields: 'status_code,status', access_token: accessToken }, 'GET');
    if (d.status_code === 'FINISHED') return;
    if (d.status_code === 'ERROR' || d.status_code === 'EXPIRED') {
      throw new Error(`Instagram не смог обработать картинку: ${d.status || d.status_code}`);
    }
    await new Promise(res => setTimeout(res, 2000));
  }
  throw new Error('Instagram слишком долго обрабатывает картинку');
}

async function publish({ account, caption: rawCaption, images, postType = 'feed', publication }) {
  const { igUserId, accessToken } = account?.config || {};
  if (!igUserId || !accessToken) return { ok: false, error: 'Не заданы igUserId / accessToken' };
  if (!images.length) return { ok: false, error: 'Instagram не принимает пост без картинки' };

  // Instagram не понимает разметку: HTML ушёл бы в подпись буквально,
  // а wa.me-ссылка — простынёй URL-кодированного текста (и всё равно не кликается).
  // adaptCaption убирает ссылку, ставит призыв писать в Direct / WhatsApp и
  // дописывает хэштеги — страховка для публикаций, созданных до этих правил.
  const caption = htmlToPlain(adaptCaption(rawCaption, 'instagram', null, publication?.product));

  try {
    let containerId;

    if (postType === 'story') {
      // У историй нет подписи — Graph API просто игнорирует caption.
      const c = await graph(`/${igUserId}/media`, {
        image_url: fitForInstagram(images[0], 'story'),
        media_type: 'STORIES',
        access_token: accessToken,
      });
      containerId = c.id;
    } else if (images.length > 1) {
      // Карусель: сначала дочерние контейнеры, потом родительский.
      const children = [];
      for (const url of images.slice(0, 10)) {
        const child = await graph(`/${igUserId}/media`, {
          image_url: fitForInstagram(url, 'feed'),
          is_carousel_item: 'true',
          access_token: accessToken,
        });
        children.push(child.id);
      }
      for (const id of children) await waitReady(id, accessToken);
      const parent = await graph(`/${igUserId}/media`, {
        media_type: 'CAROUSEL',
        children,
        caption,
        access_token: accessToken,
      });
      containerId = parent.id;
    } else {
      const c = await graph(`/${igUserId}/media`, {
        image_url: fitForInstagram(images[0], 'feed'),
        caption,
        access_token: accessToken,
      });
      containerId = c.id;
    }

    await waitReady(containerId, accessToken);

    const published = await graph(`/${igUserId}/media_publish`, {
      creation_id: containerId,
      access_token: accessToken,
    });

    // Ссылка на пост — не критично, если не отдадут (у историй permalink нет).
    let externalUrl = '';
    try {
      const info = await graph(`/${published.id}`, { fields: 'permalink', access_token: accessToken }, 'GET');
      externalUrl = info.permalink || '';
    } catch { /* необязательная деталь */ }

    return { ok: true, externalId: String(published.id), externalUrl };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Отклик на пост ───────────────────────────────────────────────────────────
//
// Считаются два разных источника, и они не взаимозаменяемы:
//   · поля самого поста (like_count, comments_count) — отдаются всегда;
//   · insights (просмотры, охват, сохранения) — только с правом
//     instagram_manage_insights и только у бизнес-аккаунта.
// Поэтому лайки и комментарии тянем отдельным запросом: пропадёт доступ к
// статистике — они всё равно будут в отчёте.
//
// Набор метрик у Meta разный для ленты и историй и меняется от версии к версии
// (impressions выпилили в пользу views), а на лишнюю метрику API отвечает ошибкой
// на весь запрос. Поэтому спрашиваем оптимистично и на отказ выкидываем ровно те
// метрики, которые Meta назвала в ошибке, — так новые поля появятся сами, когда
// аккаунт до них дорастёт.
const MEDIA_METRICS = ['views', 'reach', 'saved', 'shares', 'total_interactions'];
const STORY_METRICS = ['views', 'reach', 'replies', 'navigation'];

// Ключи Meta → поля отчёта
const METRIC_FIELD = {
  views: 'views', impressions: 'views', reach: 'reach', saved: 'saved',
  shares: 'shares', total_interactions: 'interactions', replies: 'replies',
};

// Чем заменить метрику, которую эта версия API не знает. views — новое имя
// показов, у постов, снятых до перехода Meta, работает старое.
const METRIC_FALLBACK = { views: 'impressions' };

// Отказ по статистике переводим в инструкцию: «(#10) Application does not have
// permission» значит, что приложению Meta не выдали instagram_manage_insights.
// Лайки и комментарии при этом приходят — важно, чтобы человек видел разницу
// между «пост никто не смотрел» и «нам не дали цифру».
function explainStatsError(msg) {
  const text = String(msg || '');
  if (/does not exist|cannot be loaded|Unsupported get request/i.test(text)) {
    return 'Instagram не отдаёт этот пост: обычно так бывает, если его удалили или скрыли в аккаунте.';
  }
  if (/#10\b|does not have permission|instagram_manage_insights/i.test(text)) {
    return 'Нет доступа к статистике: приложению в Meta нужно разрешение instagram_manage_insights, '
      + 'после него перевыпустите токен — появятся просмотры, охват и сохранения. '
      + 'Лайки и комментарии считаются и без него.';
  }
  if (/expired|Session has expired|#190/i.test(text)) {
    return 'Токен истёк — выпустите новый на странице площадок.';
  }
  return text;
}

// Имена метрик, на которые ругнулась Meta: «(#100) ... metric[0] must be one of
// the following values: ...» или «The following metrics are not supported: views».
function rejectedMetrics(message, asked) {
  const text = String(message || '').toLowerCase();
  return asked.filter(m => text.includes(m.toLowerCase()));
}

async function fetchInsights(mediaId, accessToken, metrics, depth = 0) {
  if (!metrics.length || depth > 3) return {};
  try {
    const d = await graph(`/${mediaId}/insights`, { metric: metrics, access_token: accessToken }, 'GET');
    const out = {};
    (d.data || []).forEach(row => {
      const field = METRIC_FIELD[row.name];
      const value = row.values?.[0]?.value;
      if (field && typeof value === 'number') out[field] = value;
    });
    return out;
  } catch (e) {
    const bad = rejectedMetrics(e.message, metrics);
    // Ошибка не про конкретную метрику (нет прав, пост слишком старый) — отдаём наверх
    if (!bad.length) throw e;
    const next = metrics.filter(m => !bad.includes(m));
    bad.forEach(m => {
      const alt = METRIC_FALLBACK[m];
      if (alt && !metrics.includes(alt)) next.push(alt);
    });
    return fetchInsights(mediaId, accessToken, next, depth + 1);
  }
}

/**
 * Цифры по одному посту: лайки, комментарии, просмотры, охват, сохранения.
 * Возвращает { ok, stats } либо { ok: false, error } — вызывающий пишет ошибку
 * рядом с постом, чтобы было видно, почему цифр нет.
 */
async function stats({ account, externalId, postType = 'feed' }) {
  const { accessToken } = account?.config || {};
  if (!accessToken) return { ok: false, error: 'Не задан accessToken' };
  if (!externalId)  return { ok: false, error: 'У поста нет id на площадке' };

  const out = {};
  const notes = [];

  // У историй лайков и комментариев нет — Graph API падает на этих полях
  const fields = postType === 'story' ? 'permalink,timestamp' : 'like_count,comments_count,permalink,timestamp';
  try {
    const base = await graph(`/${externalId}`, { fields, access_token: accessToken }, 'GET');
    if (typeof base.like_count === 'number')     out.likes    = base.like_count;
    if (typeof base.comments_count === 'number') out.comments = base.comments_count;
  } catch (e) {
    notes.push(explainStatsError(e.message));
  }

  try {
    Object.assign(out, await fetchInsights(externalId, accessToken,
      postType === 'story' ? STORY_METRICS : MEDIA_METRICS));
  } catch (e) {
    // Статистика историй живёт 24 часа — по старым Meta отвечает ошибкой,
    // и это не поломка, а ожидаемое поведение.
    notes.push(postType === 'story'
      ? `${explainStatsError(e.message)} (у историй статистика доступна сутки)`
      : explainStatsError(e.message));
  }

  // Обе части часто падают с одной и той же причиной (протухший токен) —
  // повторять её дважды в отчёте незачем.
  const why = [...new Set(notes)].join('; ');
  if (!Object.keys(out).length) return { ok: false, error: why || 'Instagram не отдал ни одной цифры' };
  return { ok: true, stats: out, warning: why };
}

// Instagram удалять через API НЕ УМЕЕТ: в Content Publishing API есть только создание.
// Поэтому честно говорим, что пост надо снять руками, и отдаём ссылку на него.
async function unpublish() {
  return {
    ok: false,
    manual: true,
    error: 'Instagram не даёт удалять посты через API — снимите пост вручную в приложении',
  };
}

module.exports = { publish, unpublish, stats, fitForInstagram };
