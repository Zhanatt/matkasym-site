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

// Человеческий заголовок из технического названия 1С:
// «MATKASYM HOME — Bosogo 9SW (чёрный)» → «Bosogo 9SW»
// «Стремянка HuanLai 5 (Серый)»          → «Стремянка HuanLai 5»
// Цвет убираем намеренно: он идёт отдельной строкой в характеристиках,
// а в скобках у карточек 1С он часто не совпадает с фото.
function postTitle(p) {
  let t = String(p.fullName || p.name || '').trim();
  t = t.replace(/^MATKASYM\s+(HOME|SHAAR)\s*[—–-]\s*/i, '');
  t = t.replace(/\s*\([^()]*\)\s*$/, '');
  return t.trim() || String(p.name || '').trim();
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

  const title = esc(postTitle(p));
  const set   = setLabel(p.set);
  const desc  = withDescription ? String(p.description || '').trim() : '';
  const specs = (p.specs || [])
    .filter(s => s && s.key && String(s.value).trim())
    .slice(0, MAX_SPECS);

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

module.exports = { buildCaption, htmlToPlain, formatPhone, visibleLength, buildHashtags, postTitle, setLabel, whatsappLink, esc, ORDER_WHATSAPP };
