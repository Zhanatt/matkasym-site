// Тестовая продажа нового товара — общая логика для роутов: нумерация карточек и уведомления по этапам.
const ProductLaunch = require('../models/ProductLaunch');
const User = require('../models/User');
const { sendTelegramMessage } = require('./telegram');

const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';

const PL_STAGES = ['proposed', 'content', 'design', 'review', 'published', 'target', 'feedback', 'done'];
const PL_STAGE_LABEL = {
  proposed:  'Предложено менеджерами',
  content:   'Контент',
  design:    'Дизайн',
  review:    'Согласование',
  published: 'Опубликовано',
  target:    'Таргет',
  feedback:  'Обратная связь',
  done:      'Завершён',
};

// Доску ведёт контент-менеджер (Зайнагуль) и редакция; дизайнеры работают на своём этапе.
const isContentManager = u => u?.role === 'owner' || u?.role === 'editor' || !!u?.canManageContent;
const isDesignerUser   = u => u?.role === 'designer';
// Таргетолог получает задачу на рекламу и заполняет её результат
const isAdsManager     = u => !!u?.canRunAds;

// Товары IKEA идут отдельным потоком (свой заказ, своя логистика), поэтому на доске
// их узнают по логотипу. Пока карточки в каталоге нет, зацепиться можно только за
// название и ссылку на источник; в остальных случаях поставщика ставят руками.
const IKEA_HINT = /(^|[^a-zа-яё])(ikea|икеа|икея)([^a-zа-яё]|$)/i;

function detectSupplier({ name = '', sourceUrl = '' } = {}) {
  if (IKEA_HINT.test(`${name} ${sourceUrl}`) || /(^|\/\/|\.)ikea\.[a-z]/i.test(sourceUrl)) return 'IKEA';
  return '';
}

// ── Сверка с каталогом ──────────────────────────────────────────────────────
// «Товар есть в каталоге» — это позиция, которой у нас торгуют: её заказывают
// повторно, а не тестируют. Карточка, заведённая под сам тест (test_sale) или под
// будущий товар (planned/in_development), каталогом не считается — иначе любой тест
// сразу выглядел бы как «уже наш».
const NOT_IN_CATALOG = ['test_sale', 'planned', 'in_development'];
const isCatalogProduct = p => !!p && !NOT_IN_CATALOG.includes(p.productStatus);

// Менеджеры предлагают товары названиями, а не артикулами, поэтому часть карточек
// на доске — это товары, которые у нас уже есть. Такому товару тестовая продажа не
// нужна: его надо просто заказать. Ищем совпадение по названию, чтобы подсветить это
// на доске и предложить привязать карточку каталога.

// Размеры («54x18x71»), единицы и служебные слова из названий не помогают опознать
// товар, зато сильно шумят при сравнении — выкидываем.
const MATCH_STOP = new Set(['С', 'И', 'ДЛЯ', 'ИЗ', 'НА', 'В', 'ШТ', 'ШТУК', 'ШТУКИ', 'СМ', 'ММ',
  'N', 'АР', 'AP', 'JP', 'CN', 'НАБОР', 'КОМПЛЕКТ']);

// Названия моделей IKEA приходят то латиницей, то кириллицей («ВАРИЕРА» ↔ «VARIERA»,
// «Ниссапор» ↔ «NISSAFORS»), а в каталоге ещё и со шведскими диакритиками (LÅTSFÅGEL).
// Приводим всё к латинскому «скелету», иначе тот же товар не узнать.
const CYR2LAT = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ж: 'ZH', З: 'Z', И: 'I', Й: 'I',
  К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U',
  Ф: 'F', Х: 'H', Ц: 'C', Ч: 'CH', Ш: 'SH', Щ: 'SH', Ъ: '', Ы: 'Y', Ь: '', Э: 'E',
  Ю: 'U', Я: 'A',
};
const skeleton = (w) => String(w)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // Å → A, Ä → A
  .toUpperCase()
  .split('').map(ch => (ch in CYR2LAT ? CYR2LAT[ch] : ch)).join('');

const matchTokens = (s) => String(s || '')
  .toUpperCase().replace(/Ё/g, 'Е').replace(/[^0-9A-ZА-ЯÀ-ɏ]+/g, ' ').trim()
  .split(' ')
  .filter(w => w.length > 1 && !MATCH_STOP.has(w) && !/^\d+([X×]\d+)*$/.test(w));

// Артикул IKEA — 8 цифр; встречается в sku (MKS-40307866-3), у поставщика и в ссылке
const ikeaArticles = (...parts) => {
  const found = String(parts.filter(Boolean).join(' ')).match(/\b\d{8}\b/g);
  return found ? [...new Set(found)] : [];
};

// Расстояние Левенштейна — на коротких словах дёшево. Нужно, чтобы «НИССАПОР»
// сошлось с «NISSAFORS»: транслитерация даёт не букву в букву.
function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Насколько слово может отличаться, чтобы считать его тем же: чем длиннее, тем
// свободнее (транслитерация «съедает» до двух букв в длинном названии модели).
const nearlySame = (a, b) => a === b || (a.length >= 6 && editDistance(a, b) <= Math.min(2, Math.floor(a.length / 4)));

const jaccard = (a, b) => {
  const A = [...new Set(a)], B = [...new Set(b)];
  if (!A.length || !B.length) return 0;
  const used = new Set();
  let inter = 0;
  for (const x of A) {
    const hit = B.find((y, i) => !used.has(i) && nearlySame(x, y) && (used.add(i), true));
    if (hit !== undefined) inter++;
  }
  return inter / (A.length + B.length - inter);
};

// Совпадение по артикулу IKEA считаем точным, по названию — от 0.45 (ниже начинается
// «тележка» ↔ «тележка», то есть совпадение по одному общему слову).
const MATCH_MIN = 0.45;
// Название модели («VESKEN», «NISSAFORS») — если оно есть и у нас, это тот же товар,
// даже когда остальные слова не совпали. В каталоге такие названия всегда написаны
// латиницей — по этому их и отличаем от обычных русских слов, иначе «для хранения»
// сойдётся с «для хранение» и опознает что угодно. Плюс требуем редкости: слово
// должно встречаться у горстки карточек, а не у половины каталога.
const MODEL_MIN_LEN = 6;
const MODEL_MAX_DF  = 8;
const MODEL_SCORE   = 0.9;

// Индекс каталога под сверку. Строится один раз на пачку карточек: токены
// (в латинском «скелете») и частота каждого слова — по ней узнаём названия моделей.
function buildCatalogIndex(products) {
  const latinWords = new Set();          // слова, написанные в каталоге латиницей
  const items = products.map(p => {
    const title = p.fullName || p.name || '';
    const words = matchTokens(title);
    for (const w of words) if (/^[A-ZÀ-ɏ]+$/.test(w)) latinWords.add(skeleton(w));
    return {
      product:  p,
      tokens:   words.map(skeleton),
      articles: ikeaArticles(p.sku, p.supplier?.sku, title),
    };
  });
  const df = new Map();
  for (const it of items) {
    for (const t of new Set(it.tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  // Названия моделей: латинские, длинные и редкие — по ним товар узнаётся вернее всего
  const rare = [...latinWords].filter(t => t.length >= MODEL_MIN_LEN && (df.get(t) || 0) <= MODEL_MAX_DF);
  return { items, df, rare };
}

// Ищем в каталоге тот же товар. Возвращает { product, score, exact } или null.
function findCatalogMatch(launch, catalog) {
  const index = Array.isArray(catalog) ? buildCatalogIndex(catalog) : catalog;
  const lt = matchTokens(launch?.name).map(skeleton);
  const la = ikeaArticles(launch?.name, launch?.sku, launch?.content?.sourceUrl);
  // Слова, по которым товар опознают: длинное слово из карточки, которому нашлась
  // близкая пара среди редких слов каталога («НИССАПОР» → NISSAFORS)
  const models = new Set();
  for (const t of lt) {
    if (t.length < MODEL_MIN_LEN) continue;
    for (const r of index.rare) if (nearlySame(t, r)) models.add(r);
  }

  let best = null;
  for (const it of index.items) {
    const exact = la.length && it.articles.some(a => la.includes(a));
    const byModel = !exact && it.tokens.some(t => models.has(t));
    // При совпадении модели остальные слова решают, какой из вариантов модели наш
    // (VESKEN полка или VESKEN тележка) — поэтому подмешиваем их в оценку.
    const jac = jaccard(lt, it.tokens);
    const score = exact ? 1 : Math.max(jac, byModel ? MODEL_SCORE + jac / 10 : 0);
    if (score >= MATCH_MIN && (!best || score > best.score)) {
      best = { product: it.product, score, exact: !!exact };
    }
  }
  return best;
}

// Сквозная нумерация карточек — по ней товар зовут в переписке, пока у него нет артикула
async function nextNumber() {
  const last = await ProductLaunch.findOne().sort({ number: -1 }).select('number');
  return (last?.number || 0) + 1;
}

// Кого дёргаем на этапе: дизайн — дизайнеров, таргет — только таргетолога,
// остальное — тех, кто ведёт контент.
async function recipientsForStage(stage) {
  const filter = stage === 'design' ? { role: 'designer' }
               : stage === 'target' ? { canRunAds: true }
               : { $or: [{ canManageContent: true }, { role: 'editor' }] };
  // review, content, published… — те, кто ведёт доску
  return User.find({ ...filter, telegramChatId: { $nin: ['', null] } })
    .select('telegramChatId name').lean();
}

const STAGE_TEXT = {
  // Предложение от менеджера — уходит тем, кто ведёт доску: решить, брать в работу или нет
  proposed:  l => `💡 <b>Менеджер предложил товар</b> №${l.number}\n${l.name}\n\n` +
                  (l.createdByName ? `Предложил: ${l.createdByName}\n` : '') +
                  (l.content?.sourceUrl ? `Источник: ${l.content.sourceUrl}\n` : '') +
                  (l.content?.description ? `Почему: ${l.content.description}\n` : '') +
                  (l.content?.photos?.length ? `Фото: ${l.content.photos.length} шт.\n` : '') +
                  `\nПосмотрите и возьмите в работу — или уберите с доски.`,
  content:   l => `🧪 <b>Новый товар на тест</b> №${l.number}\n${l.name}\n\nЭтап: <b>Контент</b> — нужны фото, ссылка на источник и описание.`,
  design:    l => `🎨 <b>Товар готов к дизайну</b> №${l.number}\n${l.name}\n\n` +
                  (l.content?.sourceUrl ? `Источник: ${l.content.sourceUrl}\n` : '') +
                  (l.content?.description ? `Описание: ${l.content.description}\n` : '') +
                  `Фото: ${l.content?.photos?.length || 0} шт.`,
  review:    l => `👀 <b>Дизайн на согласовании</b> №${l.number}\n${l.name}\n\n` +
                  `Макетов: ${l.design?.files?.length || 0} шт.` +
                  (l.design?.assigneeName ? `\nДизайнер: ${l.design.assigneeName}` : '') +
                  `\n\nПосмотрите и утвердите — или верните на доработку с замечаниями.`,
  published: l => `📣 <b>Пост вышел, идёт тестовая продажа</b> №${l.number}\n${l.name}\n\nСобираем отклик: обращения, реакции, комментарии, заявки клиентов.`,
  // Задача таргетологу: важно, чтобы он понимал — товара на складе нет, это проверка спроса
  target:    l => `🎯 <b>Задача: запустить таргет</b> №${l.number}\n` +
                  `Товар: <b>${l.name}</b>\n\n` +
                  `⚠️ Это <b>тестовый продукт</b> — на складе его нет. Продаём по фото и смотрим, ` +
                  `сколько будет обращений и заявок.\n\n` +
                  (l.content?.description ? `Описание: ${l.content.description}\n` : '') +
                  (l.publish?.links?.length
                    ? `Посты:\n${l.publish.links.map(x => `• ${x.platform || 'пост'}: ${x.url}`).join('\n')}\n`
                    : '') +
                  (l.target?.note ? `\nОт команды: ${l.target.note}\n` : '') +
                  `\nПосле открутки заполните результат: обращения, реакции, комментарии, заявки клиентов и вывод.`,
  feedback:  l => `📊 <b>Пора подвести итог тестовой продажи</b> №${l.number}\n${l.name}`,
  done:      l => `✅ <b>Тестовая продажа закрыта</b> №${l.number}\n${l.name}`,
};

// Возврат с согласования — адресно тому, кто делал макеты
async function notifyRework(launch) {
  try {
    const filter = launch.design?.assignee
      ? { _id: launch.design.assignee }
      : { role: 'designer' };
    const users = await User.find({ ...filter, telegramChatId: { $nin: ['', null] } })
      .select('telegramChatId').lean();
    if (!users.length) return;
    const text = `↩️ <b>Дизайн вернули на доработку</b> №${launch.number}\n${launch.name}\n\n` +
      (launch.review?.note ? `Замечания: ${launch.review.note}\n` : '') +
      `\n${SITE_URL}/admin/pending-receive`;
    for (const u of users) await sendTelegramMessage(u.telegramChatId, text);
  } catch (e) {
    console.error('[product-launch] telegram rework notify failed:', e.message);
  }
}

// Назначили исполнителя — говорим об этом лично ему
async function notifyAssigned(launch, userId) {
  try {
    const u = await User.findOne({ _id: userId, telegramChatId: { $nin: ['', null] } })
      .select('telegramChatId').lean();
    if (!u) return;
    const text = `🎨 <b>Вам назначили дизайн</b> №${launch.number}\n${launch.name}\n\n` +
      (launch.content?.sourceUrl ? `Источник: ${launch.content.sourceUrl}\n` : '') +
      (launch.content?.description ? `Описание: ${launch.content.description}\n` : '') +
      `Фото: ${launch.content?.photos?.length || 0} шт.\n\n${SITE_URL}/admin/pending-receive`;
    await sendTelegramMessage(u.telegramChatId, text);
  } catch (e) {
    console.error('[product-launch] telegram assign notify failed:', e.message);
  }
}

async function notifyStage(launch, stage) {
  try {
    const build = STAGE_TEXT[stage];
    if (!build) return;
    const users = await recipientsForStage(stage);
    if (!users.length) return;
    const text = `${build(launch)}\n\n${SITE_URL}/admin/pending-receive`;
    for (const u of users) await sendTelegramMessage(u.telegramChatId, text);
  } catch (e) {
    console.error('[product-launch] telegram notify failed:', e.message);
  }
}

module.exports = { PL_STAGES, PL_STAGE_LABEL, isContentManager, isDesignerUser, isAdsManager, nextNumber, detectSupplier, isCatalogProduct, buildCatalogIndex, findCatalogMatch, notifyStage, notifyRework, notifyAssigned };
