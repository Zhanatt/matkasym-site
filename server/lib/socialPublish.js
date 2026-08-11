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
    error:       result.ok ? '' : (result.error || 'Неизвестная ошибка'),
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

    const updated = await publishTarget(pub, pub.targets[i]);
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

let running = false;

// Тик планировщика: публикует всё, чей срок наступил (отложенные посты и задержки узлов).
// Дёргается таймером в index.js и внешним cron-пингом — на Render free сервис засыпает.
async function tickPublications() {
  if (running) return { skipped: 'busy' };
  running = true;
  try {
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
  buildProductText,
  renderTemplate,
  templateContext,
  captionFor,
  runPublication,
  unpublishPublication,
  tickPublications,
};
