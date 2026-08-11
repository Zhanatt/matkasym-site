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

async function publish({ account, caption: rawCaption, images = [], postType = 'feed' }) {
  const { pageId, accessToken } = account?.config || {};
  if (!pageId || !accessToken) return { ok: false, error: 'Не заданы pageId / accessToken' };

  // Историй у страниц через API нет (photo_stories — только для приложений
  // с отдельным доступом), поэтому честно говорим, а не падаем на публикации.
  if (postType === 'story') {
    return { ok: false, error: 'Facebook: истории через API не публикуются — только обычный пост' };
  }

  // Facebook не рендерит HTML: разметка ушла бы в текст буквально.
  // adaptCaption — страховка: ссылку на WhatsApp меняет на призыв «напишите в
  // Direct / WhatsApp» даже у публикаций, созданных до этого правила.
  const message = htmlToPlain(adaptCaption(rawCaption, 'facebook'));
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

module.exports = { publish, unpublish, compressed };
