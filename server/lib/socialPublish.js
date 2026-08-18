// Диспетчер автопубликаций: берёт публикацию и разносит её по площадкам.
//
// Каждая площадка отрабатывает независимо: упавший Instagram не мешает Telegram,
// результат по каждой пишется в publication.targets[i]. Повторить можно только
// упавшие площадки (retry) — уже опубликованное не дублируется.
const Publication   = require('../models/Publication');
const { SocialAccount } = require('../models/SocialAccount');
const { buildCaption, adaptCaption } = require('./postCaption');
const { phrases, detectLang } = require('./postLang');
const { signOf } = require('./stockBases');

const PUBLISHERS = {
  telegram:  require('./publishers/telegram'),
  instagram: require('./publishers/instagram'),
  facebook:  require('./publishers/facebook'),
  bitrix24:  require('./publishers/bitrix24'),
  site:      require('./publishers/site'),
};

const PLATFORM_LABELS = {
  telegram:  'Telegram',
  instagram: 'Instagram',
  facebook:  'Facebook',
  bitrix24:  'Битрикс24',
  site:      'Сайт',
};

function fmtPrice(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

// Значения плейсхолдеров для шаблона площадки.
function templateContext(product, text, lang) {
  const p = product || {};
  const specs = (p.specs || []).filter(s => s && s.key && s.value)
    .map(s => `• ${s.key}: ${s.value}`).join('\n');
  return {
    name:     p.fullName || p.name || '',
    fullName: p.fullName || p.name || '',
    price:    p.priceUndefined || !p.price ? phrases(lang).priceOnRequest : `${fmtPrice(p.price)} ${signOf(p)}`,
    sku:      p.sku || '',
    specs,
    set:      p.set || '',
    brand:    p.brand || '',
    text:     text || '',
  };
}

// {name}, {price}, {specs}… → значения. Неизвестный плейсхолдер остаётся как есть,
// чтобы опечатку в шаблоне было видно в предпросмотре, а не молча съедало.
function renderTemplate(template, ctx) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, key) => (key in ctx ? ctx[key] : m));
}

// Текст для конкретной площадки: свой шаблон узла → свой шаблон аккаунта → общий текст.
// Готовый текст ещё прогоняется через adaptCaption: в Instagram и Facebook вместо
// ссылки на WhatsApp уходит призыв «напишите в Direct / WhatsApp».
// Язык берём с формы, а если его не передали — определяем по самому тексту.
function captionFor({ nodeTemplate, account, product, text, lang }) {
  const tpl = nodeTemplate || account?.captionTemplate || '';
  const l   = lang || detectLang(text);
  const out = tpl.trim() ? renderTemplate(tpl, templateContext(product, text, l)) : (text || '');
  return adaptCaption(out, account?.platform, l, product);
}

// Автотекст для товара — общий черновик, который потом можно править руками.
// Генератор общий для всех площадок — lib/postCaption.js.
const buildProductText = buildCaption;

// Отправка одной площадки. Возвращает обновлённый объект target (не сохраняет).
async function publishTarget(pub, target) {
  const account = await SocialAccount.findById(target.account);
  if (!account) {
    return { ...target.toObject(), status: 'failed', error: 'Площадка удалена из настроек' };
  }
  if (!account.enabled) {
    return { ...target.toObject(), status: 'skipped', error: 'Площадка отключена' };
  }

  const publisher = PUBLISHERS[account.platform];
  if (!publisher) {
    return { ...target.toObject(), status: 'failed', error: `Нет публикатора для ${account.platform}` };
  }

  const result = await publisher.publish({
    account,
    caption:  target.caption || pub.text || '',
    images:   pub.images || [],
    postType: target.postType || 'feed',
    publication: pub, // нужен ленте сайта: товар и автор публикации
  });

  await SocialAccount.updateOne({ _id: account._id }, {
    $set: { lastPublishedAt: result.ok ? new Date() : account.lastPublishedAt, lastError: result.ok ? '' : (result.error || '') },
  });

  return {
    ...target.toObject(),
    status:      result.ok ? 'published' : 'failed',
    // Успех бывает неполным: Telegram мог не осилить альбом и уйти одной фоткой.
    // Такое пишем в error и при status: 'published' — журнал показывает эту строку.
    error:       result.ok ? (result.warning || '') : (result.error || 'Неизвестная ошибка'),
    externalId:  result.externalId || '',
    externalUrl: result.externalUrl || '',
    publishedAt: result.ok ? new Date() : undefined,
  };
}

// Разослать все созревшие площадки публикации. onlyFailed — повтор упавших.
// Отправляем последовательно: параллельная заливка нескольких Instagram-контейнеров
// упирается в лимиты Meta, а выигрыш в секундах здесь никому не нужен.
async function runPublication(pubId, { onlyFailed = false } = {}) {
  const pub = await Publication.findById(pubId).populate('product');
  if (!pub) return { error: 'Публикация не найдена' };

  const now = new Date();
  pub.status    = 'running';
  pub.startedAt = pub.startedAt || now;
  await pub.save();

  for (let i = 0; i < pub.targets.length; i++) {
    const t = pub.targets[i];
    const ready = onlyFailed ? t.status === 'failed' : t.status === 'pending';
    if (!ready) continue;
    if (t.dueAt && t.dueAt > now) continue; // ещё рано — заберёт следующий тик

    pub.targets[i].status = 'publishing';
    await pub.save();

    // Площадки независимы: сорвавшаяся сеть до Telegram не должна ронять весь запрос
    // 500-й ошибкой. Раньше исключение выносило роут наружу, таргет навсегда оставался
    // в publishing, а человек шёл публиковать заново — и получал второй пост.
    let updated;
    try {
      updated = await publishTarget(pub, pub.targets[i]);
    } catch (e) {
      console.error(`[socialPublish] ${pub.targets[i].platform} упал:`, e.message);
      updated = { ...pub.targets[i].toObject(), status: 'failed', error: e.message || 'Сбой при отправке' };
    }
    pub.targets[i] = updated;
    await pub.save();
  }

  // Публикация завершена, когда не осталось ни ожидающих, ни отложенных площадок.
  const unfinished = pub.targets.some(t => ['pending', 'publishing'].includes(t.status));
  pub.status = unfinished ? 'running' : 'done';
  if (!unfinished) pub.finishedAt = new Date();
  await pub.save();

  return {
    ok: true,
    published: pub.targets.filter(t => t.status === 'published').length,
    failed:    pub.targets.filter(t => t.status === 'failed').length,
    publication: pub,
  };
}

// Снять публикацию со всех площадок, где она реально вышла.
// Площадки независимы и здесь: Битрикс удалится, а Instagram придётся снимать руками —
// такие помечаем needs_manual и НЕ считаем ошибкой, это ограничение самой Meta.
async function unpublishPublication(pubId) {
  const pub = await Publication.findById(pubId);
  if (!pub) return { error: 'Публикация не найдена' };

  const results = [];

  for (let i = 0; i < pub.targets.length; i++) {
    const t = pub.targets[i];
    if (t.status !== 'published') continue; // удалять нечего

    const account   = await SocialAccount.findById(t.account);
    const publisher = account ? PUBLISHERS[account.platform] : null;

    let res;
    if (!publisher?.unpublish) {
      res = { ok: false, manual: true, error: 'Для этой площадки удаление не поддерживается' };
    } else {
      try {
        res = await publisher.unpublish({ account, externalId: t.externalId });
      } catch (e) {
        res = { ok: false, error: e.message };
      }
    }

    pub.targets[i].status = res.ok ? 'deleted' : (res.manual ? 'needs_manual' : 'failed');
    pub.targets[i].error  = res.ok ? '' : (res.error || '');

    results.push({
      title:       t.title,
      platform:    t.platform,
      ok:          !!res.ok,
      manual:      !res.ok && !!res.manual,
      error:       res.ok ? '' : (res.error || ''),
      externalUrl: t.externalUrl || '',
    });
  }

  await pub.save();

  return {
    ok: true,
    results,
    removed: results.filter(r => r.ok).length,
    manual:  results.filter(r => r.manual).length,
    failed:  results.filter(r => !r.ok && !r.manual).length,
  };
}

/**
 * Обновить отклик на пост: сходить на площадки и записать лайки, комментарии,
 * просмотры в publication.targets[i].stats.
 *
 * Тянем только там, где пост реально вышел и площадка умеет отдавать цифры
 * (сейчас Instagram). Ошибка одной площадки не мешает остальным: она ложится
 * рядом с постом в stats.error, чтобы в журнале было видно, почему цифр нет,
 * а не «пусто без объяснений».
 */
async function refreshStats(pubId) {
  const pub = await Publication.findById(pubId);
  if (!pub) return { error: 'Публикация не найдена' };

  let updated = 0, failed = 0;
  for (let i = 0; i < pub.targets.length; i++) {
    const t = pub.targets[i];
    if (t.status !== 'published' || !t.externalId) continue;

    const publisher = PUBLISHERS[t.platform];
    if (!publisher?.stats) continue;

    const account = await SocialAccount.findById(t.account);
    if (!account) {
      pub.targets[i].stats = { ...(t.stats?.toObject?.() || {}), updatedAt: new Date(), error: 'Площадка удалена из настроек' };
      failed++;
      continue;
    }

    let res;
    try {
      res = await publisher.stats({ account, externalId: t.externalId, postType: t.postType });
    } catch (e) {
      res = { ok: false, error: e.message };
    }

    if (res.ok) {
      // Прежние цифры не затираем целиком: у историй охват через сутки перестаёт
      // отдаваться, и обнулять уже собранное было бы враньём.
      pub.targets[i].stats = {
        ...(t.stats?.toObject?.() || {}), ...res.stats,
        updatedAt: new Date(), error: res.warning || '',
      };
      updated++;
    } else {
      pub.targets[i].stats = { ...(t.stats?.toObject?.() || {}), updatedAt: new Date(), error: res.error || 'Не удалось получить статистику' };
      failed++;
    }
  }

  if (updated || failed) await pub.save();
  return { ok: true, updated, failed, publication: pub };
}

// Обновить отклик по последним публикациям разом — кнопкой в журнале.
// Идём последовательно: Meta считает запросы в час, и параллельный обстрел
// упрётся в лимит быстрее, чем принесёт выигрыш в секундах.
async function refreshRecentStats({ limit = 20 } = {}) {
  const pubs = await Publication.find({
    targets: { $elemMatch: { status: 'published', platform: { $in: STATS_PLATFORMS }, externalId: { $nin: ['', null] } } },
  }).sort({ createdAt: -1 }).limit(Math.min(limit, 50)).select('_id').lean();

  let updated = 0, failed = 0;
  for (const p of pubs) {
    const r = await refreshStats(p._id);
    updated += r.updated || 0;
    failed  += r.failed  || 0;
  }
  return { ok: true, posts: pubs.length, updated, failed };
}

// Площадки, которые умеют отдавать отклик на пост
const STATS_PLATFORMS = Object.keys(PUBLISHERS).filter(k => typeof PUBLISHERS[k].stats === 'function');

// Сколько времени считаем повторную отправку того же товара случайной.
// Плановый перепост через день-два — нормальная работа, а вот второй пост через
// полчаса почти всегда означает: упал Instagram, человек поправил и отправил всё
// заново — а Telegram, где пост уже вышел, получил вторую копию.
const DUPLICATE_WINDOW_MS = 6 * 60 * 60 * 1000;

// Куда из выбранных площадок этот же пост уже уходил за последние 6 часов.
// Снятые публикации (status: 'deleted') не в счёт: их сняли как раз для того,
// чтобы опубликовать заново. Возвращает по одной — самой свежей — записи на площадку.
// before — точка отсчёта, по умолчанию «сейчас»; задаётся явно, чтобы правило
// можно было прогнать по журналу задним числом и проверить на реальных дублях.
async function recentlyPublished({ productId, text, accountIds, before }) {
  const ids = (accountIds || []).map(String).filter(id => /^[a-f0-9]{24}$/i.test(id));
  if (!ids.length) return [];

  const scope = productId
    ? { product: productId }
    : { kind: 'custom', text: String(text || '').trim() };

  const to = before ? new Date(before) : new Date();
  const pubs = await Publication.find({
    ...scope,
    createdAt: { $gte: new Date(to.getTime() - DUPLICATE_WINDOW_MS), $lt: to },
    targets:   { $elemMatch: { status: 'published', account: { $in: ids } } },
  }).sort({ createdAt: -1 }).lean();

  const wanted = new Set(ids);
  const seen   = new Map();
  for (const p of pubs) {
    for (const t of p.targets || []) {
      const id = String(t.account);
      if (t.status !== 'published' || !wanted.has(id) || seen.has(id)) continue;
      seen.set(id, {
        accountId:   id,
        platform:    t.platform,
        title:       t.title,
        publishedAt: t.publishedAt || p.createdAt,
        externalUrl: t.externalUrl || '',
        number:      p.number,
      });
    }
  }
  return [...seen.values()];
}

let running = false;

// Сколько ждём отправку, прежде чем считать её оборванной. Самая долгая площадка —
// карусель Instagram: до 10 картинок с ожиданием обработки, минуты три в худшем случае.
const STUCK_MS = 10 * 60 * 1000;

// Подъём застрявших. Если процесс умер посреди отправки (деплой, перезапуск Render,
// обрыв сети), таргет остаётся в publishing навсегда: тик ищет только pending,
// «повторить» — только failed. Признаём такую отправку оборванной, но НЕ повторяем сами:
// пост мог всё-таки выйти, решать человеку.
async function releaseStuck() {
  const stuck = await Publication.find({
    updatedAt: { $lt: new Date(Date.now() - STUCK_MS) },
    targets:   { $elemMatch: { status: 'publishing' } },
  }).limit(20);

  for (const pub of stuck) {
    pub.targets.forEach(t => {
      if (t.status !== 'publishing') return;
      t.status = 'failed';
      t.error  = 'Отправка оборвалась (перезапуск сервера или сбой сети). '
               + 'Проверьте площадку перед повтором — пост мог всё-таки выйти.';
    });
    const unfinished = pub.targets.some(t => ['pending', 'publishing'].includes(t.status));
    pub.status = unfinished ? 'running' : 'done';
    if (!unfinished && !pub.finishedAt) pub.finishedAt = new Date();
    await pub.save();
    console.warn(`[socialPublish] публикация №${pub.number} висела в publishing — помечена как упавшая`);
  }
  return stuck.length;
}

// Тик планировщика: публикует всё, чей срок наступил (отложенные посты и задержки узлов).
// Дёргается таймером в index.js и внешним cron-пингом — на Render free сервис засыпает.
async function tickPublications() {
  if (running) return { skipped: 'busy' };
  running = true;
  try {
    await releaseStuck();
    const now = new Date();
    const due = await Publication.find({
      status: { $in: ['pending', 'running'] },
      targets: { $elemMatch: { status: 'pending', dueAt: { $lte: now } } },
    }).select('_id').limit(5).lean();

    const results = [];
    for (const p of due) results.push(await runPublication(p._id));
    return { processed: results.length };
  } catch (e) {
    console.error('[socialPublish] tick error:', e.message);
    return { error: e.message };
  } finally {
    running = false;
  }
}

module.exports = {
  PLATFORM_LABELS,
  DUPLICATE_WINDOW_MS,
  recentlyPublished,
  buildProductText,
  renderTemplate,
  templateContext,
  captionFor,
  runPublication,
  unpublishPublication,
  refreshStats,
  refreshRecentStats,
  STATS_PLATFORMS,
  tickPublications,
};
