// Единый генератор текста поста для Telegram-канала (витрина для клиентов).
// Остатки и себестоимость НЕ включаются — только то, что видит покупатель.
//
// Единый генератор подписи для автопубликаций (socialPublish).
// Меняете здесь — меняйте и там.

// Валюта подписи берётся у товара (Product.currency): сом или тенге.
const { signOf } = require('./stockBases');
// Признак товара IKEA — у него в посте своя логика цены.
const { IKEA } = require('./bufferZones');
// Язык поста: по умолчанию кыргызский, казахский — переключателем в /admin/publish.
const { phrases, normLang, translateSpecKey, translateSpecValue, detectLang, DEFAULT_LANG } = require('./postLang');
// Словарь названий товаров + название, вписанное руками в карточку.
const { translateName, manualName } = require('./postNames');
// Тематические хэштеги для Instagram и Facebook.
const { hashtagsFor } = require('./postTags');

// Номера WhatsApp для приёма заказов, только цифры в международном формате.
// У SHAAR свой отдел продаж: заказ на его товар, ушедший на общий номер,
// до нужных людей не доходит. Остальные бренды (home, kyzmat) — общий номер.
const digitsOnly = v => String(v || '').replace(/\D/g, '');

const ORDER_WHATSAPP       = digitsOnly(process.env.WHATSAPP_ORDER_PHONE || '996500001652');
const ORDER_WHATSAPP_SHAAR = digitsOnly(process.env.WHATSAPP_ORDER_PHONE_SHAAR || '996501111726');

// Номер по бренду товара. Бренд может не прийти вовсе (пост «без товара»,
// свободный текст) — тогда общий номер, как было до разделения.
function orderPhone(p) {
  return p?.brand === 'matkasym-shaar' ? ORDER_WHATSAPP_SHAAR : ORDER_WHATSAPP;
}

// Метка источника в первом сообщении клиента: по ней в WhatsApp видно,
// что лид пришёл с поста, а не откуда-то ещё, и с какой именно площадки.
const TRAFFIC_TAGS = {
  telegram:  '#tg_matrix',
  instagram: '#inst_matrix',
  facebook:  '#fb_matrix',
};
const TRAFFIC_TAG = TRAFFIC_TAGS.telegram;   // площадка по умолчанию — канал

const trafficTag = platform => TRAFFIC_TAGS[platform] || TRAFFIC_TAG;

// Короткий призыв к действию перед ссылкой на WhatsApp — одна строка,
// в ленте канала длинный текст дочитывают редко.
//
// Фраза выбирается по РЕАЛЬНОМУ состоянию товара, а не ставится наугад:
// «успейте, осталось мало» под товаром, которого на складе 500 штук, читатель
// раскусит с первого раза, и дальше он не поверит ни одному посту.
// «Осталось мало» без числа — намеренно: точный остаток это внутренняя цифра.
// Тексты фраз по языкам — в lib/postLang.js.

// «Осталось мало» — только у тестовой продажи. Пробную партию везут маленькой
// и специально распродают быстро, там срочность настоящая.
//
// У каталожного товара этой строки нет НИКОГДА, независимо от остатка. Раньше
// порогом брался буферный запас из 1С — но это внутренняя цифра снабжения
// («ниже неё дозаказываем у поставщика»), а не «покупателю пора спешить».
// У вешалки INFINITY буфер 50 при остатке 44 — клиенту сообщалось, что товар
// заканчивается, хотя его почти полсотни. Под это правило попадал любой ходовой
// товар: чем лучше продаётся, тем выше буфер, тем чаще ложная срочность.
function ctaLine(p, lang = DEFAULT_LANG) {
  const CTA = phrases(lang).cta;
  if (p.productStatus === 'test_sale') return CTA.low;

  if (p.oldPrice > 0 && p.price > 0 && p.oldPrice > p.price) return CTA.discount;
  if ((Number(p.stock) || 0) > 0) return CTA.inStock;

  if (p.isOnOrder || p.inTransit) return CTA.onOrder;
  return CTA.default;
}

// Тип товара для названий, где его нет вообще: «Ailana» ничего не говорит
// покупателю, а «Скамейка Ailana» — говорит. Список точечный, а не общий
// по категориям: у многих товаров тип уже есть в названии, а часть категорий
// («Прочее», «other», «Покраска») подставлять просто нечего.
const CATEGORY_PREFIX = {
  'Узоры (профиль 15x15)':    'Узор',
  'Узоры (квадрат 10мм)':     'Узор',
  'Балясины (профиль 15x15)': 'Балясина',
  'Балясины (квадрат 10мм)':  'Балясина',
  'Уголки (профиль 15x15)':   'Уголок',
  'скамейка':                 'Скамейка',
  'Ограждения':               'Ограждение',
  'фонарь':                   'Фонарь',
  'Кашпо':                    'Кашпо',
  'Перголы':                  'Пергола',
  'Трубы':                    'Труба',
  'Стойки':                   'Стойка',
  'Акустические экраны':      'Акустический экран',
  'Щиты монтажные (ЩМП)':     'Щит монтажный',
  'Щиты сантехнические':      'Щит сантехнический',
  'Щиты этажные':             'Щит этажный',
  'Шкафы пожарные':           'Пожарный шкаф',
  'ландшафтный-светильник':   'Ландшафтный светильник',
  'навес-для-скамьи':         'Навес для скамьи',
  'потолочный-люк':           'Потолочный люк',
  'качели':                   'Качели',
};

// Слаг сета → человекочитаемое название (как в AdminSets.jsx).
const SET_NAMES = {
  'onuguu-set':         'Onuguu Set',
  'dayar-tutuk':        'Dayar Tutuk',
  'achyk-asman':        'Achyk Asman',
  'den-sooluk':         'Den Sooluk',
  'zhashyl-omur':       'Zhashyl Omur',
  'zhashyl-omur-shaar': 'Zhashyl Omur (Shaar)',
  'jenil-ashkana':      'Jenil Ashkana',
  'konok-keldi':        'Konok Keldi',
  'korkom-aiym':        'Korkom Aiym',
  'kosh-keliniz':       'Kosh Keliniz',
  'onoi-sakta':         'Onoi Sakta',
  'baary-oorunda':      'Baary Oorunda',
  'sanarip-tv':         'Sanarip TV',
  'shirin-balalyk':     'Shirin Balalyk',
  'taza-kiym':          'Taza Kiym',
  'uydo-ishtoo':        'Uydo Ishtoo',
  'mazza-seyil':        'Mazza Seyil',
  'bekem-fasad':        'Bekem Fasad',
  'bekem-tosmo':        'Bekem Tosmo',
  'bilim-kelechek':     'Bilim Kelechek',
  'kooz-koopsuzduk':    'Kooz Koopsuzduk',
  'uzak-koldon':        'Uzak Koldon',
  '0-tashtandy':        '0-Tashtandy',
  '0-tashtandy-home':   '0-Tashtandy (Home)',
  'poly-fabrikat':      'Polufabrikat',
};

// Служебные сеты — в пост их не пишем, для покупателя это шум.
const HIDDEN_SETS = new Set(['misc', 'equipment', 'other', 'samples', 'small-batch', 'poly-fabrikat']);

const MAX_CAPTION = 1024;  // жёсткий лимит Telegram на подпись к фото
const MAX_SPECS   = 6;

// Telegram считает лимит подписи «после разбора entities»: HTML-теги и длинный
// href в 1024 символа НЕ входят, в счёт идёт только видимый текст.
function visibleLength(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;|&gt;/g, '<')
    .replace(/&amp;/g, '&')
    .length;
}

// Телефон для показа человеку: 996500001652 → +996 500 001 652.
function formatPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return '';
  return '+' + d.slice(0, 3) + ' ' + (d.slice(3).match(/.{1,3}/g) || []).join(' ');
}

// HTML → простой текст для площадок без разметки (Instagram).
// Ссылку на WhatsApp разворачиваем в читаемый номер: сырой wa.me с
// URL-кодированным ?text= в подписи Instagram выглядит мусором.
function htmlToPlain(html) {
  return String(html || '')
    .replace(/<a\s+href="https:\/\/wa\.me\/(\d+)[^"]*"\s*>(.*?)<\/a>/gis, (m, phone, label) => `${label}: ${formatPhone(phone)}`)
    .replace(/<a\s+href="([^"]*)"\s*>(.*?)<\/a>/gis, '$2: $1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function fmtPrice(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

// Экранирование под parse_mode: 'HTML' — иначе «&» или «<» в названии
// роняют публикацию с ошибкой парсинга.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setLabel(slug) {
  if (!slug || HIDDEN_SETS.has(slug)) return '';
  return SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Тех.параметры, зашитые в название номенклатуры 1С. В карточках они почти
// всегда пустые (IP есть в имени у 67 щитов и ни у одного — в specs), поэтому
// вытаскиваем их в отдельные строки, а заголовок оставляем коротким.
// Кириллица требует явных диапазонов: \w в JS — это только [A-Za-z0-9_],
// из-за чего «цепей» обрезалось до «цеп», а «ей» оставалось мусором в названии.
const NAME_PARAMS = [
  { key: 'Степень защиты', re: /\bIP\s?-?\d{2}\b/i, fmt: m => m[0].replace(/[\s-]/g, '').toUpperCase() },
  { key: 'Кол-во цепей',   re: /\b(\d+)\s*цеп[а-яё]*/i, fmt: m => m[1] },
  { key: 'Габариты',
    re: /\b\d{2,4}\s*[хx*]\s*\d{2,4}(?:\s*[хx*]\s*\d{2,4})?(?:\s*(?:мм|см|м|дюйм[а-яё]*))?/i,
    fmt: m => m[0].replace(/\s*[хx*]\s*/gi, '×').replace(/×(\D)/, ' $1').replace(/\s+/g, ' ').trim() },
];

// Разбор названия: короткий заголовок + вытащенные из него параметры.
// «Электрощит (коробка обратной цепи, металлопластик) 18 цепей К. IP40»
//   → «Электрощит» + Кол-во цепей: 18, Степень защиты: IP40
// «MATKASYM HOME — Bosogo 9SW (чёрный)» → «Bosogo 9SW»
// Цвет в скобках убираем намеренно: он есть отдельной строкой в характеристиках,
// а в названиях 1С часто не совпадает с фото товара.
function extractNameParams(raw) {
  let rest = String(raw || '').replace(/^MATKASYM\s+(HOME|SHAAR)\s*[—–-]\s*/i, '');
  const params = [];
  for (const { key, re, fmt } of NAME_PARAMS) {
    const m = rest.match(re);
    if (!m) continue;
    params.push({ key, value: fmt(m) });
    rest = rest.replace(re, ' ');
  }
  rest = rest
    .replace(/\([^()]*\)/g, ' ')            // скобки — целиком, где бы ни стояли
    .replace(/\s+[A-ZА-ЯЁ]\.(?=\s|$)/g, ' ')  // висячие «К.» из номенклатуры
    .replace(/\s*([,;])\s*(?=[,;])/g, '')    // осадок вида «140, , одинарный»
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;-]+|[\s,;-]+$/g, '')
    .trim();
  return { title: rest, params };
}

// Дописываем тип товара в начало, если его там нет. Сравниваем по основам ВСЕХ
// слов префикса: у «Акустический экран» опорное слово второе, и проверка только
// по первому давала «Акустический экран EILIF настольный экран». Нормализация
// «ё»→«е» нужна, иначе «Ершик» не совпадёт с категорией «Ёршики».
function withTypePrefix(title, category) {
  const prefix = CATEGORY_PREFIX[category];
  if (!prefix || !title) return title;
  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');
  const haystack = norm(title);
  const stems = norm(prefix).split(/\s+/).filter(w => w.length > 3).map(w => w.slice(0, -1));
  if (stems.some(st => haystack.includes(st))) return title;
  return `${prefix} ${title}`;
}

// Заголовок поста. Порядок такой: вписанное руками название из карточки →
// словарь типов товара → русское название как есть. Вписанное руками всегда
// главнее: словарь знает частые типы, а не весь каталог.
function postTitle(p, lang = 'ru') {
  const manual = manualName(p, lang);
  if (manual) return manual;
  const { title } = extractNameParams(p.fullName || p.name || '');
  const ru = withTypePrefix(title || String(p.name || '').trim(), p.category);
  return translateName(ru, lang);
}

// Текст первого сообщения клиента в WhatsApp: что заказывает + метка площадки.
function orderMessage(p, lang = DEFAULT_LANG, platform) {
  return `${phrases(lang).orderText}: ${postTitle(p, lang)}\n\n${trafficTag(platform)}`;
}

// Ссылка «Заказать товар» — открывает WhatsApp с готовым текстом заказа.
function whatsappLink(p, lang = DEFAULT_LANG, platform) {
  return `https://wa.me/${orderPhone(p)}?text=${encodeURIComponent(orderMessage(p, lang, platform))}`;
}

// Площадки, где заказ идёт только через личку: ссылки в посте нет.
// Ссылка в подписи Instagram не кликается вовсе, а Facebook под ссылкой рисует
// свою карточку-превью и режет охват — поэтому вместо неё идёт призыв написать.
const DIRECT_ONLY_PLATFORMS = new Set(['instagram', 'facebook']);

// Цену в этих постах печатаем только у товаров IKEA. Это перепродажа: покупатель
// и так знает порядок цен, открытая цифра снимает главный вопрос и приводит его
// готовым. У своей продукции цену не пишем — вопрос «сколько стоит?» в Direct
// это и есть начало разговора с покупателем.
const showsPrice = p => p?.supplier?.company === IKEA;

// Строка со ссылкой на WhatsApp — в готовом (в т.ч. отредактированном руками) тексте.
const ORDER_LINK_LINE = /^[^\n]*<a\s+href="https:\/\/wa\.me\/[^"]*"[^>]*>[^<]*<\/a>[^\n]*$/gim;
// Та же ссылка, вставленная в текст голым URL, без тега <a>.
const BARE_WA_LINE    = /^[^\n]*https:\/\/wa\.me\/\S*[^\n]*$/gim;
// Строка с ценой. Опознаём по 💰 — этот значок ставит priceLine и только он,
// поэтому правило переживает и правку текста руками, и смену языка.
const PRICE_LINE      = /^[^\n]*💰[^\n]*$/gm;

// Текст уже заканчивается хэштегами — своих не добавляем: либо это наши с
// прошлого прогона (функция вызывается дважды), либо человек написал свои.
const ENDS_WITH_TAGS = /(^|\n)\s*#[^\s#]+(\s+#[^\s#]+)*\s*$/;

// Текст под конкретную площадку: у Instagram и Facebook вырезаем ссылку на
// WhatsApp (вместо неё — призыв писать в Direct), у не-IKEA убираем ещё и цену,
// а в конец дописываем тематические хэштеги.
// Функция идемпотентна — второй вызов (на повторе публикации) ничего не меняет.
function adaptCaption(html, platform, lang, product) {
  if (!DIRECT_ONLY_PLATFORMS.has(platform)) return String(html || '');
  const cta = phrases(lang || detectLang(html)).directCta;
  let out = String(html || '')
    .replace(ORDER_LINK_LINE, cta)
    .replace(BARE_WA_LINE, cta)
    // если ссылка встречалась дважды, двух одинаковых призывов подряд быть не должно
    .replace(new RegExp(`(?:^${escapeRe(cta)}\\n)+(?=${escapeRe(cta)}$)`, 'gm'), '');

  // Товар может не прийти вовсе (пост свободным текстом) — тогда считаем, что это
  // не IKEA, и цену убираем: так было до правила, лишняя цифра хуже её отсутствия.
  if (!showsPrice(product)) out = out.replace(PRICE_LINE, '');

  out = out
    // от вырезанной цены остаётся пустая строка — иначе в посте зияет дыра
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (ENDS_WITH_TAGS.test(out)) return out;
  const tags = hashtagsFor(product, lang || detectLang(out));
  return tags ? `${out}\n\n${tags}` : out;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Черновик поста. Структура: заголовок → сет → описание → характеристики →
// цена → призыв к действию и кнопка заказа. Пустые блоки просто пропускаются,
// поэтому текст корректен и для товара без specs и без description.
// Какая цена уходит в пост. Оптовая — для постов на партнёров/дилеров,
// розничная — для витрины. Дефолт розничный: канал читают покупатели.
function priceLine(p, mode, lang = DEFAULT_LANG) {
  const t = phrases(lang);
  const wholesale = mode === 'wholesale';
  const value = wholesale ? p.priceWholesale : p.price;
  const label = wholesale ? t.priceWholesale : t.price;
  if (p.priceUndefined || !value) return `💰 ${t.priceOnRequest}`;
  return `💰 ${label}: <b>${fmtPrice(value)} ${signOf(p)}</b>`;
}

function buildCaption(p, opts = {}) {
  if (!p) return '';
  const withDescription = opts.withDescription !== false;
  const priceMode = opts.priceMode === 'wholesale' ? 'wholesale' : 'retail';
  const lang = normLang(opts.lang);
  const t = phrases(lang);

  // Параметры вытаскиваем из РУССКОГО названия (IP, цепи, габариты зашиты в
  // номенклатуру 1С), а в заголовок ставим переведённое название.
  const { params } = extractNameParams(p.fullName || p.name || '');
  const title = esc(postTitle(p, lang));
  const set   = setLabel(p.set);
  const desc  = withDescription ? String(p.description || '').trim() : '';

  const own  = (p.specs || []).filter(s => s && s.key && String(s.value).trim());
  const have = new Set(own.map(s => String(s.key).trim().toLowerCase()));
  // Вытащенные из названия параметры идут первыми — они опознают товар лучше,
  // чем вес. Заполненную руками характеристику с тем же ключом не перебиваем.
  const specs = [...params.filter(x => !have.has(x.key.toLowerCase())), ...own].slice(0, MAX_SPECS);

  const build = (descLimit, specLimit) => {
    const lines = [];
    lines.push(`🆕 <b>${title}</b>`);
    if (set) lines.push(`📦 ${t.set}: <b>${esc(set)}</b>`);

    if (desc && descLimit > 0) {
      const short = desc.length > descLimit ? desc.slice(0, descLimit).replace(/\s+\S*$/, '') + '…' : desc;
      lines.push('', esc(short));
    }

    const shown = specs.slice(0, specLimit);
    if (shown.length) {
      lines.push('');
      // Ключи и типовые значения характеристик переводим; всё остальное
      // (числа, модели, размеры) уходит как есть — см. lib/postLang.js.
      shown.forEach(s => lines.push(
        `• ${esc(translateSpecKey(s.key, lang))}: ${esc(translateSpecValue(s.value, lang))}`
      ));
    }

    lines.push('', priceLine(p, priceMode, lang));

    lines.push('', ctaLine(p, lang), `📲 <a href="${whatsappLink(p, lang)}">${esc(t.orderLink)}</a>`);

    return lines.join('\n');
  };

  // Ужимаем текст под лимит Telegram: сначала описание, затем характеристики.
  let out = build(400, specs.length);
  for (const [d, s] of [[250, specs.length], [150, 4], [0, 4], [0, 2], [0, 0]]) {
    if (visibleLength(out) <= MAX_CAPTION) break;
    out = build(d, s);
  }
  return out;
}

module.exports = { buildCaption, ctaLine, priceLine, extractNameParams, withTypePrefix, htmlToPlain, formatPhone, visibleLength, postTitle, setLabel, whatsappLink, adaptCaption, DIRECT_ONLY_PLATFORMS, esc, ORDER_WHATSAPP, ORDER_WHATSAPP_SHAAR, orderPhone, orderMessage, TRAFFIC_TAGS };
