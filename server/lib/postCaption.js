// Единый генератор текста поста для Telegram-канала (витрина для клиентов).
// Остатки и себестоимость НЕ включаются — только то, что видит покупатель.
//
// ВАЖНО: файл-близнец на клиенте — client/src/utils/postCaption.js.
// Логика должна совпадать: ручной пост (AdminTelegramPost) и очередь
// автопостинга (telegramQueue) обязаны давать одинаковый текст.
// Меняете здесь — меняйте и там.

// Номер WhatsApp для приёма заказов, только цифры в международном формате.
const ORDER_WHATSAPP = (process.env.WHATSAPP_ORDER_PHONE || '996502902905').replace(/\D/g, '');

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

const BRAND_TAGS = {
  'matkasym-home':  'MATKASYM_HOME',
  'matkasym-shaar': 'MATKASYM_SHAAR',
};

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

// Телефон для показа человеку: 996502902905 → +996 502 902 905.
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

function postTitle(p) {
  const { title } = extractNameParams(p.fullName || p.name || '');
  return title || String(p.name || '').trim();
}

// Строка → хэштег: всё кроме букв и цифр становится «_».
// «Полки для обуви» → #Полки_для_обуви, «Uzak Koldon» → #Uzak_Koldon.
function toTag(s) {
  const body = String(s || '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  if (!body) return '';
  if (/^\d/.test(body)) return '#_' + body;   // хэштег не может начинаться с цифры
  return '#' + body;
}

// Хэштеги для навигации внутри канала: тапнув по тегу, покупатель
// видит все похожие товары. Порядок: категория → сет → бренд.
function buildHashtags(p) {
  const tags = [];
  const push = (t) => { if (t && !tags.includes(t)) tags.push(t); };
  push(toTag(p.category));
  push(toTag(setLabel(p.set)));
  push(toTag(BRAND_TAGS[p.brand]));
  return tags;
}

// Ссылка «Заказать товар» — открывает WhatsApp с готовым текстом заказа.
function whatsappLink(p) {
  const title = postTitle(p);
  const text  = `Хочу заказать: ${title}`;
  return `https://wa.me/${ORDER_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

// Черновик поста. Структура: заголовок → сет → описание → характеристики →
// цена → кнопка заказа → хэштеги. Пустые блоки просто пропускаются,
// поэтому текст корректен и для товара без specs и без description.
function buildCaption(p, opts = {}) {
  if (!p) return '';
  const withDescription = opts.withDescription !== false;

  const { title: rawTitle, params } = extractNameParams(p.fullName || p.name || '');
  const title = esc(rawTitle || String(p.name || '').trim());
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
    if (set) lines.push(`📦 Сет: <b>${esc(set)}</b>`);

    if (desc && descLimit > 0) {
      const short = desc.length > descLimit ? desc.slice(0, descLimit).replace(/\s+\S*$/, '') + '…' : desc;
      lines.push('', esc(short));
    }

    const shown = specs.slice(0, specLimit);
    if (shown.length) {
      lines.push('');
      shown.forEach(s => lines.push(`• ${esc(s.key)}: ${esc(String(s.value).trim())}`));
    }

    lines.push('');
    if (p.priceUndefined || !p.price) {
      lines.push('💰 Цена по запросу');
    } else {
      lines.push(`💰 Цена: <b>${fmtPrice(p.price)} сом</b>`);
    }

    lines.push('', `📲 <a href="${whatsappLink(p)}">Заказать товар в WhatsApp</a>`);

    const tags = buildHashtags(p);
    if (tags.length) lines.push('', tags.join(' '));

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

module.exports = { buildCaption, extractNameParams, htmlToPlain, formatPhone, visibleLength, buildHashtags, postTitle, setLabel, whatsappLink, esc, ORDER_WHATSAPP };
