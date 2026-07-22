// Публикация в Instagram через Meta Graph API (IG Business/Creator аккаунт).
//
// Схема у Meta двухшаговая: сначала создаётся «контейнер» (/media), потом он публикуется
// (/media_publish). Картинку Instagram скачивает САМ по ссылке — значит URL обязан быть
// публичным и отдавать jpeg. Cloudinary подходит, приватные Drive-ссылки — нет.
//
// account.config = { igUserId, accessToken, username }
const GRAPH = 'https://graph.facebook.com/v21.0';

// Instagram принимает только определённые пропорции (пост 4:5…1.91:1, история 9:16)
// и падает на всём остальном. Cloudinary умеет дорисовать поля прямо в URL —
// дешевле подогнать картинку здесь, чем ловить «Media aspect ratio not supported».
function fitForInstagram(url, postType) {
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  const t = postType === 'story'
    ? 'f_jpg,q_auto,c_pad,b_auto,ar_9:16,w_1080'
    : 'f_jpg,q_auto,c_pad,b_auto,ar_4:5,w_1080';
  return url.replace('/image/upload/', `/image/upload/${t}/`);
}

async function graph(path, params, method = 'POST') {
  const url = `${GRAPH}${path}`;
  const body = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => body.append(k, Array.isArray(v) ? v.join(',') : String(v)));

  const r = method === 'GET'
    ? await fetch(`${url}?${body.toString()}`)
    : await fetch(url, { method: 'POST', body });

  const d = await r.json().catch(() => ({}));
  if (d.error) throw new Error(d.error.error_user_msg || d.error.message || 'Instagram API error');
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

async function publish({ account, caption, images, postType = 'feed' }) {
  const { igUserId, accessToken } = account?.config || {};
  if (!igUserId || !accessToken) return { ok: false, error: 'Не заданы igUserId / accessToken' };
  if (!images.length) return { ok: false, error: 'Instagram не принимает пост без картинки' };

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

module.exports = { publish, fitForInstagram };
