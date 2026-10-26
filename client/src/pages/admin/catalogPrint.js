// Каталог MATKASYM — вёрстка полос и печать в PDF силами самого браузера.
//
// Раньше PDF собирал @react-pdf/renderer. Он умеет крошечное подмножество CSS —
// ни градиентов, ни фоновых картинок, ни псевдоэлементов, ни теней, — и повторить
// в нём свёрстанный дизайн физически нельзя: получалось грубо. Здесь полосы
// собираются обычным HTML, а PDF снимает печатный движок Chrome — тот же, что
// стоит за `chrome --headless --print-to-pdf`, которым в проекте делают этикетки.
// Точность при этом один в один с тем, что видно на экране.
//
// Все размеры ниже сняты замером с макета «Каталог хоум мой, пример.pdf»
// (страницы 3 и 5) и приведены к пунктам A4.

import { adminGetCustomCategories, adminGetPdfDetails } from '../../api/index';
import { CATEGORIES } from '../../config/categorySpecs';
import { variantKey, variantLabel, variantTitle, coverOf } from '../../utils/variantKey';

// ── Сетка полосы ──────────────────────────────────────────────────────────────
const PAGE_W = 595, PAGE_H = 842;
const MARGIN_L = 37.8;                  // левое поле
const COL_W    = 228;                   // ширина колонки
const GUTTER   = 58;                    // средник
const HEAD_TOP = 16.2;                  // верх логотипа
const HEAD_RULE_Y = 33.8;               // линейка под шапкой
const CARD_TOP = 49.5;                  // верх первой карточки
const CARD_PITCH = 393.7;               // шаг между рядами карточек
const IMG_H    = 222;                   // кадр снимка
const ROWS_PER_PAGE = 2;
const COLS_PER_PAGE = 2;
const PER_PAGE = ROWS_PER_PAGE * COLS_PER_PAGE;

// ── Цвета макета ──────────────────────────────────────────────────────────────
const RED  = '#E30521';                 // плашка цены и знак
const RULE = '#899FA3';                 // все линейки
const INK  = '#000000';

// ── Обложки ───────────────────────────────────────────────────────────────────
// Свои у каждого бренда: HOME, SHAAR, KYZMAT. Ширину берём под печать — 1654 px
// это A4 при 200 dpi; на 595 px, как было раньше, обложка на бумаге мылила.
const CV = w => `https://res.cloudinary.com/dnbg21ef8/image/upload/f_jpg,q_auto:good,w_${w}`;
const COVERS = {
  home: {
    title: `${CV(1654)}/v1780894224/matkasym/covers/title-page-home.png`,
    end:   `${CV(1654)}/v1780894227/matkasym/covers/end-page-home.png`,
  },
  shaar: {
    title: `${CV(1654)}/v1780894225/matkasym/covers/title-page-shaar.png`,
    end:   `${CV(1654)}/v1780894228/matkasym/covers/end-page-shaar.png`,
  },
  kyzmat: {
    title: `${CV(1654)}/v1780894226/matkasym/covers/title-page-kyzmat.png`,
    end:   `${CV(1654)}/v1780894229/matkasym/covers/end-page-kyzmat.png`,
  },
};

// ── Словари ───────────────────────────────────────────────────────────────────
const PRICE_LABELS = {
  price:          'рознич. цена',
  priceWholesale: 'оптовая цена',
  priceDealer:    'дилерская цена',
};

// Цвет из поля товара — в кружок-образец. Слова встречаются и по-русски,
// и по-английски: в базе поле заполняют руками.
const COLOR_HEX = {
  'белый': '#FFFFFF', 'белая': '#FFFFFF', 'white': '#FFFFFF',
  'черный': '#1A1A1A', 'чёрный': '#1A1A1A', 'черная': '#1A1A1A', 'чёрная': '#1A1A1A', 'black': '#1A1A1A',
  'серый': '#8A8A8A', 'серая': '#8A8A8A', 'grey': '#8A8A8A', 'gray': '#8A8A8A',
  'серебристый': '#C0C0C0', 'серебристая': '#C0C0C0', 'silver': '#C0C0C0',
  'красный': '#D32F2F', 'красная': '#D32F2F', 'red': '#D32F2F',
  'синий': '#1565C0', 'синяя': '#1565C0', 'blue': '#1565C0',
  'темно-серый': '#4A4F55', 'тёмно-серый': '#4A4F55',
  'светло-серый': '#CCCCCC', 'светло-серая': '#CCCCCC',
  'желтый': '#F2C200', 'жёлтый': '#F2C200', 'yellow': '#F2C200',
  'зеленый': '#2E7D32', 'зелёный': '#2E7D32', 'зеленая': '#2E7D32', 'зелёная': '#2E7D32', 'green': '#2E7D32',
  'бежевый': '#D4B896', 'бежевая': '#D4B896', 'beige': '#D4B896',
  'коричневый': '#795548', 'коричневая': '#795548', 'brown': '#795548',
  'золотой': '#D4AF37', 'золотая': '#D4AF37', 'gold': '#D4AF37',
  'розовый': '#EC407A', 'розовая': '#EC407A', 'pink': '#EC407A',
  'оранжевый': '#FF9800', 'оранжевая': '#FF9800', 'orange': '#FF9800',
  'фиолетовый': '#7B1FA2', 'фиолетовая': '#7B1FA2', 'purple': '#7B1FA2',
  'бирюзовый': '#00BCD4', 'бирюзовая': '#00BCD4',
  'голубой': '#42A5F5', 'голубая': '#42A5F5',
  'антрацит': '#444444',
};

// Название категории для кикера над товаром. Свой словарь здесь уже был, и он
// отстал от жизни: категорий в базе больше, чем строк в нём, и на полосу
// выходили служебные ярлыки вроде «electric-panel-outdoor» и «fan-barrier».
// Берём те же названия, что видит админка: справочник CATEGORIES плюс
// категории, заведённые руками, — их отдаёт /admin/custom-categories.
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));
CATEGORY_LABELS.other = '';   // «Другое» кикером не подписываем

let customLabels = {};

const hasPdfOrder = p => p != null && p.pdfOrder != null && Number.isFinite(Number(p.pdfOrder));

// pdfOrder — свой порядок товаров сета в печати, поверх категорий. Из страницы
// сета группы — это категории одного сета, а порядок идёт через них, поэтому
// там их сначала сливаем в одну (заголовков групп в этом режиме всё равно нет).
// Без номера — после пронумерованных, как стояли.
function byPdfOrder(groups, headFromGroups) {
  const all = groups.flatMap(g => g.products || []);
  // Со страницы сета группы — его категории, а заголовков групп нет: сливаем
  // всегда, иначе лист pdfPage, линейка или серия рвались на границе категорий
  // (освещение MAZZA SEYIL — «Ландшафтное» + «Остальное» печаталось 4 + 1)
  const list = headFromGroups || !groups.length ? groups : [{ ...groups[0], products: all }];
  if (!all.some(hasPdfOrder)) return list;
  return list.map(g => {
    const ps = g.products || [];
    if (!ps.some(hasPdfOrder)) return g;
    const key = (p, i) => (hasPdfOrder(p) ? Number(p.pdfOrder) : 1e6 + i);
    return { ...g, products: ps.map((p, i) => [p, key(p, i)]).sort((a, b) => a[1] - b[1]).map(([p]) => p) };
  });
}

// Списки приходят урезанными (brief: 1 фото, 2 характеристики). Товарам из
// линеек, серий и групп догружаем все характеристики и галерею; не вышло —
// печатаем из того, что есть.
async function withPdfDetails(groups) {
  const needs = p => p && (p.pdfRange || p.pdfSeries || p.pdfGroup);
  const ids = [...new Set(groups.flatMap(g => g.products || []).filter(needs).map(p => p._id).filter(Boolean))];
  if (!ids.length) return groups;
  try {
    const { data } = await adminGetPdfDetails(ids);
    const byId = new Map((data?.products || []).map(d => [String(d._id), d]));
    return groups.map(g => ({ ...g, products: (g.products || []).map(p => {
      const d = needs(p) && byId.get(String(p._id));
      return d ? { ...p, specs: d.specs || p.specs, images: d.images?.length ? d.images : p.images } : p;
    }) }));
  } catch { return groups; }
}

async function loadCategoryLabels() {
  try {
    const { data } = await adminGetCustomCategories();
    customLabels = Object.fromEntries((data || []).map(c => [c.value, c.label]));
  } catch { customLabels = {}; }
}

// Ярлык без кириллицы — это slug, которому не нашлось названия. На бумаге он
// читается мусором, поэтому кикер в таком случае просто пустой.
const categoryLabel = category => {
  const label = customLabels[category] ?? CATEGORY_LABELS[category] ?? category ?? '';
  return /[а-яё]/i.test(label) ? label : '';
};

/**
 * Что попадает в каталог. Один фильтр на все выгрузки — раньше он был размножен
 * по кнопкам и смотрел только на остаток, из-за чего в каталог выходило лишнее.
 *
 * Не берём:
 *  · детали зависимого комплекта (kit_part) — их продают в составе комплекта,
 *    а не порознь; парта и стул уже показаны карточкой «ALA-TOO парта, стул»;
 *  · товары «в пути»: на складе их ещё нет, продавать по каталогу нечего;
 *  · тестовые товары HOME — временно, см. HIDE_TEST_SALE ниже;
 *  · товары без фото (с 10.10.2026 — попросили не печатать «фото готовится»).
 *    Краска с кодом цвета («#F7F9EF») остаётся: её кадр заливается самим цветом,
 *    по образцу её и выбирают;
 *  · товары с отметкой hideInPdf — их попросили не печатать поштучно
 *    (с 10.10.2026: парты и стулья сета bilim-kelechek).
 */
// ВРЕМЕННО: тестовые товары HOME в PDF-каталог не идут. Попросили 18.09.2026
// «пока не разрешу снова» — значит запрет снимается руками, поставьте false.
// Остальных брендов это не касается: у SHAAR своих тестовых семнадцать, и их
// просили не трогать.
//
// Держим отдельным флагом, а не правкой условия ниже: у тестовой продажи бывает
// остаток, и «убрать test_sale из перечисления» её бы не отсекло — она прошла
// бы по stock, как обычный товар.
const HIDE_TEST_SALE = { 'matkasym-home': true };

const isTestSale = p => p.productStatus === 'test_sale';

const hasPhoto = p => Boolean(p.images?.[0]) || /^#[0-9a-f]{6}$/i.test(String(p.color || '').trim());

export const fitsCatalog = p =>
  Boolean(p)
  && p.productStatus !== 'kit_part'
  // Цвет из pdfGroup печатается кружком на карточке группы — своё фото ему не нужно
  && (hasPhoto(p) || Boolean(p.pdfGroup))
  && !p.hideInPdf
  && !(isTestSale(p) && HIDE_TEST_SALE[p.brand])
  && (p.inStock || p.stock > 0 || p.isOnOrder || isTestSale(p));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Снимок под печать: 228 pt в ширину при 300 dpi — это ~950 px. Исходники по
// 5–6 МБ Chrome не успевает скачать до вызова печати.
const printImg = url => {
  if (!url) return '';
  if (url.includes('cloudinary.com')) {
    return url.replace('/upload/', '/upload/f_jpg,q_auto:good,w_950,c_limit/');
  }
  return url.replace(/\.webp(\?.*)?$/, '.jpg$1');
};

// ── Ничего про импорт ────────────────────────────────────────────────────────
// Каталог уходит клиентам: в нём не должно быть ни намёка на то, что товар
// привозной. Строки из закупочного прайса (название по-китайски, цена EXW в
// юанях, страна производства, упаковка поставщика, штук в коробке) не печатаем,
// как и любое значение с иероглифами или юанем.
const IMPORT_KEY = /кит\.|китай|exw|страна|производител|поставщ|в прайсе|размер упаковки|тип упаковки|объ[её]м упаковки|брутто|в коробке|упаковки \d+ шт/i;
const IMPORT_VAL = /[\u3400-\u9fff¥]|юан|китай|china|\bcn\b|made in/i;
const isImportSpec = sp => IMPORT_KEY.test(sp?.key || '') || IMPORT_VAL.test(String(sp?.value ?? ''))
  // «Объём 0.049 м³» у тумб — это объём коробки из прайса, а не товара
  || (/^объ[её]м$/i.test(sp?.key || '') && /м³|м3/i.test(String(sp?.value ?? '')));
const cleanSpecs = specs => (specs || []).filter(sp => sp?.value && !isImportSpec(sp))
  .map(sp => (/цвет|отделк/i.test(sp.key || '') ? { ...sp, value: colorRu(sp.value) } : sp));

// Цвет в базе бывает записан по-английски («white») — в каталоге по-русски
const COLOR_RU = { white: 'белый', black: 'чёрный', grey: 'серый', gray: 'серый', silver: 'серебристый',
  red: 'красный', blue: 'синий', green: 'зелёный', beige: 'бежевый', brown: 'коричневый', pink: 'розовый', gold: 'золотой' };
const colorRu = c => String(c || '').split(/\s*([,/])\s*/)
  .map(part => (/^[,/]$/.test(part) ? (part === ',' ? ', ' : ' / ') : (COLOR_RU[part.toLowerCase()] || part))).join('');

// ── Карточка ──────────────────────────────────────────────────────────────────
function cardHtml(product, priceType, currency) {
  if (!product) return '<div class="card card--empty"></div>';

  const img = printImg(product.images?.[0]);
  const kicker = categoryLabel(product.category);

  // Порядок строк как в макете: сначала габариты, потом характеристики товара.
  // У объединённой карточки с размерами (pdfVariant) первыми идут варианты
  // строками «MINI 7-9 — 480 сом», общей цены у неё нет.
  let variants = product.__variants || [];
  // Варианты HOME с одной ценой: цена — одна на карточке, варианты — одной строкой
  const priceOf = v => (priceType !== 'none' && !v.priceUndefined ? Number(v[priceType]) || 0 : 0);
  const sharedPrice = product.__homeVariants && variants.every(v => priceOf(v) === priceOf(variants[0]))
    ? priceOf(variants[0]) : null;
  const sharedRow = sharedPrice !== null ? { k: 'варианты', v: variants.map(v => v.label).join(', ') } : null;
  if (sharedRow) variants = [];
  const rows = variants.map(v => {
    const price = priceType !== 'none' && !v.priceUndefined ? Number(v[priceType]) || 0 : 0;
    return { k: v.label, v: price > 0 ? `${price.toLocaleString('ru')} ${currency}` : '' };
  });
  if (sharedRow) rows.push(sharedRow);
  if (product.dimensions) rows.push({ k: 'габариты (ДхШхВ)', v: product.dimensions });
  cleanSpecs(product.specs).forEach(s => {
    if (s?.value && !rows.some(r => r.k === s.key)) {
      rows.push({ k: s.key, v: s.unit ? `${s.value} ${s.unit}` : s.value });
    }
  });
  // Код цвета краски («#F7F9EF») строкой не выводим — сам цвет залит в кадр
  if (product.color && !product.__homeVariants && !/^#[0-9a-f]{6}$/i.test(String(product.color).trim()) && !rows.some(r => /цвет/i.test(r.k))) {
    rows.push({ k: 'цвет', v: colorRu(product.color) });
  }

  // Кружки-образцы над текстом, как в макете: цвет может быть перечислением.
  const swatches = String(product.color || '')
    .split(/[,/]/).map(c => c.trim().toLowerCase()).filter(Boolean)
    .map(c => COLOR_HEX[c]).filter(Boolean);

  // «Цена ещё не определена» — в каталоге цифры быть не должно, даже если поле
  // заполнено: там лежит прикидка, а не цена, по которой продают.
  const value = sharedPrice !== null ? sharedPrice
    : !variants.length && priceType !== 'none' && !product.priceUndefined ? Number(product[priceType]) || 0 : 0;

  // У красок фото нет, зато цвет записан кодом («#F7F9EF») — как на сайте, кадр
  // заливается самим цветом: по образцу краску и выбирают.
  const paintHex = /^#[0-9a-f]{6}$/i.test(String(product.color || '').trim()) ? product.color.trim() : '';

  return `
    <div class="card">
      <div class="shot">${img
        ? `<img src="${esc(img)}" alt="">`
        : paintHex
          ? `<div class="shot-color" style="background:${esc(paintHex)}"></div>`
          : '<div class="shot-none">фото готовится</div>'}</div>
      <div class="swatches">${
        swatches.map(hex => `<span class="sw" style="background:${hex}"></span>`).join('')
      }</div>
      <div class="head">
        <div class="head-l">
          <div class="kicker">${esc(kicker)}</div>
          <div class="name">${esc(product.name || product.fullName || '')}</div>
        </div>
        ${value > 0 ? `
        <div class="head-r">
          <div class="plabel">${esc(PRICE_LABELS[priceType] || '')}</div>
          <div class="pill">${value.toLocaleString('ru')} ${esc(currency)}</div>
        </div>` : ''}
      </div>
      <div class="specs">${
        rows.slice(0, Math.max(4, variants.length)).map(r =>
          `<div class="row"><span class="k">${esc(r.k)}</span><span class="v">${esc(r.v)}</span></div>`
        ).join('')
      }</div>
    </div>`;
}

// ── Обложка ───────────────────────────────────────────────────────────────────
// ── Серия ─────────────────────────────────────────────────────────────────────
// Модели одной серии (шкафы AICHUROK GK 4 / 6 / 9 / 12) — одним блоком на весь
// ряд полосы: слева общее фото, справа название и общие характеристики с ценой
// «от», снизу лента моделей — у каждой свой снимок, двери или отделка, габариты
// и цена. Так серию видно целиком и модели сравнивают рядом, а не листая.

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
};
const specOf = (p, re) => cleanSpecs(p.specs).find(s => re.test(s.key || '') && s.value)?.value;

// Чем модель отличается от соседей по серии: двери, ящики или отделка — берём
// то, что у моделей разное (у IS ящиков по два у всех, различает отделка).
const NOTES = [
  p => { const n = Number(specOf(p, /дверей/i)); return n ? `${n} ${plural(n, 'дверь', 'двери', 'дверей')}` : ''; },
  p => { const n = Number(specOf(p, /ящик/i));   return n ? `${n} ${plural(n, 'ящик', 'ящика', 'ящиков')}` : ''; },
  p => specOf(p, /отделк|цвет/i) || '',
];
function noteFor(items) {
  const differs = NOTES.find(f => new Set(items.map(f)).size > 1);
  const pick = differs || NOTES.find(f => items.some(f));
  return p => p.pdfNote || (pick ? pick(p) : '');
}

// «H1850*W900*D500» или «Д620×Г350×В860 мм» → «186×62×35 см» (В×Ш×Г, в см).
// Прочие записи («105x30x89») печатаем как есть, только с настоящим знаком ×.
function dimsParts(p) {
  const raw = {};
  for (const m of String(p.dimensions || '').matchAll(/([HWDВШДГ])\s*(\d+)/gi)) {
    const k = m[1].toUpperCase();
    if (!raw[k]) raw[k] = +m[2];
  }
  // «Д» — длина: это ширина, если «Ш» не указана, иначе — глубина
  const ax = { H: raw.H || raw['В'], W: raw.W || raw['Ш'] || raw['Д'], D: raw.D || raw['Г'] || (raw['Ш'] ? raw['Д'] : 0) };
  if (!(ax.H && ax.W)) return null;
  const mm = /мм/i.test(p.dimensions) || Math.max(ax.H, ax.W) >= 300;
  return [ax.H, ax.W, ax.D].filter(Boolean).map(v => (mm ? Math.round(v / 10) : v));
}
function dimsShort(p) {
  const parts = dimsParts(p);
  return parts ? `${parts.join('×')} см` : String(p.dimensions || '').replace(/\s*[xх*]\s*/gi, '×');
}

const priceOf = (p, priceType) =>
  priceType !== 'none' && !p.priceUndefined ? Number(p[priceType]) || 0 : 0;

function seriesHtml(series, priceType, currency) {
  const { title, hero, others, all } = series;

  // Общие для всех моделей характеристики — под главной моделью слева
  const norm = v => String(v ?? '').trim().toLowerCase();
  const rows = [];
  cleanSpecs(hero.specs).forEach(sp => {
    // «Серия» повторяет заголовок; длинные описания в строку не влезают
    if (/^серия$/i.test(sp.key || '') || String(sp.value).length > 32) return;
    if (rows.some(r => r.k.toLowerCase() === sp.key.toLowerCase())) return;
    if (all.every(i => cleanSpecs(i.specs).some(t => norm(t.key) === norm(sp.key) && norm(t.value) === norm(sp.value)))) {
      rows.push({ k: sp.key, v: sp.unit ? `${sp.value} ${sp.unit}` : sp.value });
    }
  });

  const note = noteFor(all);
  const pill = (p, cls) => {
    const v = priceOf(p, priceType);
    return v > 0 ? `<div class="${cls}">${v.toLocaleString('ru')} ${esc(currency)}</div>` : '';
  };
  const mini = i => {
    const img = printImg(i.images?.[0]);
    return `
      <div class="sv">
        <div class="sv-shot">${img ? `<img src="${esc(img)}" alt="">` : ''}</div>
        <div class="sv-code">${esc(i.pdfVariant || i.name)}</div>
        <div class="sv-note">${esc(note(i))}</div>
        <div class="sv-dims">${esc(dimsShort(i))}</div>
        ${pill(i, 'sv-pill')}
      </div>`;
  };
  const heroImg = printImg(hero.images?.[0]);

  return `
    <div class="series">
      <div class="se-left">
        <div class="se-hero">${heroImg ? `<img src="${esc(heroImg)}" alt="">` : ''}</div>
        <div class="se-cap">
          <div>
            <div class="se-code">${esc(hero.pdfVariant || hero.name)}</div>
            <div class="sv-note">${esc([note(hero), dimsShort(hero)].filter(Boolean).join(' · '))}</div>
          </div>
          ${pill(hero, 'pill')}
        </div>
        <div class="specs">${rows.slice(0, 3).map(r =>
          `<div class="row"><span class="k">${esc(r.k)}</span><span class="v">${esc(r.v)}</span></div>`).join('')}</div>
      </div>
      <div class="se-right">
        <div class="kicker">${esc(categoryLabel(hero.category))}</div>
        <div class="se-name">${esc(title)}</div>
        <div class="se-others${others.length <= 2 ? ' few' : ''}">${others.map(mini).join('')}</div>
      </div>
    </div>`;
}

// Товары с одинаковым pdfSeries сворачиваются в серию на месте первого из них.
// Главная модель — первая по порядку сета: её фото крупно слева, и в ленте она
// не повторяется. Остальные — справа под названием, от меньшей цены к большей,
// по две в ряд, не больше четырёх; если моделей больше, серия продолжается
// следующим блоком.
const SERIES_OTHERS = 4;
function collectSeries(products) {
  const out = [];
  const byKey = new Map();
  products.forEach(p => {
    const key = p?.pdfSeries;
    if (!key) { out.push(p); return; }
    if (!byKey.has(key)) { byKey.set(key, []); out.push({ __series: key }); }
    byKey.get(key).push(p);
  });
  return out.flatMap(p => {
    if (!p?.__series) return [p];
    const all = byKey.get(p.__series);
    // Серия из одной модели — обычная карточка
    if (all.length === 1) return [all[0]];
    const models = [all[0], ...all.slice(1).sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))];
    const blocks = [];
    for (let i = 0; i < models.length; i += 1 + SERIES_OTHERS) {
      const [hero, ...others] = models.slice(i, i + 1 + SERIES_OTHERS);
      blocks.push({ __seriesBlock: { title: p.__series, hero, others, all } });
    }
    return blocks;
  });
}

// ── Линейка размеров: одна полоса ────────────────────────────────────────────
// Щиты одной конструкции, которые отличаются только размером (настенные IP31),
// печатаются одной полосой: сверху рендер и общие характеристики, снизу все
// размеры схематичными коробами в одном масштабе — сразу видно, какой больше.

// В×Ш×Г в см: из названия («30*22*12» — высота, ширина, глубина), иначе из габаритов
function boxDims(p) {
  // Название без трёх чисел («50х40 18») — тогда из габаритов «50x40x18»
  const m = [p.name, p.dimensions].map(t => String(t || '').match(/(\d+(?:[.,]\d+)?)\s*[*xх×]\s*(\d+(?:[.,]\d+)?)\s*[*xх×]\s*(\d+(?:[.,]\d+)?)/i)).find(Boolean);
  // «1000х800х300» в названии — это миллиметры: щитов в 10 м не бывает
  if (m) { const v = m.slice(1, 4).map(x => +String(x).replace(',', '.')); return Math.max(...v) >= 300 ? v.map(x => x / 10) : v; }
  const parts = dimsParts(p);
  return parts && parts.length === 3 ? parts : null;
}

// Короб в косоугольной проекции: фасад В×Ш, глубина уходит вверх-вправо.
// Масштаб общий для всей линейки (s — пунктов на сантиметр).
function boxSvg([h, w, d], s) {
  const k = 0.5;                                    // сокращение глубины
  const dx = d * s * k * 0.87, dy = d * s * k * 0.5;
  const W = w * s, H = h * s, pad = 1;
  const vw = W + dx + pad * 2, vh = H + dy + pad * 2;
  const x0 = pad, y0 = dy + pad;                    // левый верх фасада
  const inset = Math.min(W, H) * 0.09;
  const line = 'fill="#fff" stroke="#2b3134" stroke-width="0.8" stroke-linejoin="round"';
  return `<svg viewBox="0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}" width="${vw.toFixed(1)}pt" height="${vh.toFixed(1)}pt">
    <polygon ${line} points="${x0},${y0} ${x0 + dx},${y0 - dy} ${x0 + W + dx},${y0 - dy} ${x0 + W},${y0}"/>
    <polygon ${line} points="${x0 + W},${y0} ${x0 + W + dx},${y0 - dy} ${x0 + W + dx},${y0 + H - dy} ${x0 + W},${y0 + H}"/>
    <rect ${line} x="${x0}" y="${y0}" width="${W.toFixed(1)}" height="${H.toFixed(1)}"/>
    <rect fill="none" stroke="#2b3134" stroke-width="0.6" x="${(x0 + inset).toFixed(1)}" y="${(y0 + inset).toFixed(1)}" width="${(W - inset * 2).toFixed(1)}" height="${(H - inset * 2).toFixed(1)}"/>
  </svg>`;
}

function rangeHtml(range, priceType, currency) {
  const { title, items, hero, extras = [] } = range;
  const norm = v => String(v ?? '').trim().toLowerCase();
  const rows = [];
  cleanSpecs(hero.specs).forEach(sp => {
    if (/^серия$|^вес|габарит/i.test(sp.key || '') || String(sp.value).length > 32) return;
    if (rows.some(r => r.k.toLowerCase() === sp.key.toLowerCase())) return;
    if (items.every(i => cleanSpecs(i.specs).some(t => norm(t.key) === norm(sp.key) && norm(t.value) === norm(sp.value)))) {
      rows.push({ k: sp.key, v: sp.unit ? `${sp.value} ${sp.unit}` : sp.value });
    }
  });

  // Общий масштаб: самый крупный короб занимает кадр ячейки целиком
  const dims = items.map(boxDims);
  const perRow = items.length <= 6 ? items.length : Math.ceil(items.length / 2);
  // Один ряд — короба крупнее, иначе под ним пустует полстраницы
  const cellW = (COL_W * 2 + GUTTER) / perRow - 8,
        cellH = (items.length <= perRow ? 210 : 118) - (extras.length ? 22 : 0);
  const s = Math.min(...dims.filter(Boolean).map(([h, w, d]) =>
    Math.min(cellW / (w + d * 0.435), cellH / (h + d * 0.25))));

  const cells = items.map((p, i) => {
    const v = priceOf(p, priceType);
    const weight = specOf(p, /^вес$/i);
    const d = dims[i];
    return `
      <div class="rg-cell">
        <div class="rg-box">${d ? boxSvg(d, s) : ''}</div>
        <div class="rg-dims">${d ? esc(d.map(x => String(x).replace('.', ',')).join('×')) : esc(dimsShort(p))}</div>
        ${p.pdfNote ? `<div class="rg-note">${esc(p.pdfNote)}</div>` : ''}
        ${weight ? `<div class="rg-w">${esc(weight)}</div>` : ''}
        ${v > 0 ? `<div class="rg-plabel">${esc(PRICE_LABELS[priceType] || '')}</div><div class="rg-pill">${v.toLocaleString('ru')} ${esc(currency)}</div>` : ''}
      </div>`;
  });
  // Высота ряда коробов — по самому высокому в ряду, без пустоты сверху
  const boxH = ([h, , d]) => (h + d * 0.25) * s + 2;
  const rowsHtml = [];
  for (let i = 0; i < cells.length; i += perRow) {
    const hMax = Math.max(...dims.slice(i, i + perRow).filter(Boolean).map(boxH), 20);
    rowsHtml.push(`<div class="rg-row" style="--n:${perRow};--bh:${hMax.toFixed(1)}pt">${cells.slice(i, i + perRow).join('')}</div>`);
  }
  // Сверху нужен рендер, а не чертёж: чертежи с сервера ДУ лежат в matkasym/shaar/
  // (set-drawing-first-photo.js) и стоят первыми. Берём первое фото-не-чертёж
  // у главного щита, затем у остальных; нет ни одного — первое фото главного.
  const isDrawing = u => /\/matkasym\/shaar\//.test(String(u || ''));
  const sameCat = items.filter(i => i.category === hero.category);
  const render = [hero, ...sameCat, ...items].flatMap(p => p.images || []).find(u => u && !isDrawing(u));
  const heroImg = printImg(render || hero.images?.[0]);

  // Соседи по листу (pdfRangeExtra) — карточкой внизу: фото слева, текст справа
  const extraHtml = p => {
    const v = priceOf(p, priceType);
    const img = printImg(p.images?.[0]);
    const specs = cleanSpecs(p.specs).filter(sp => sp.value && !/^вес|габарит/i.test(sp.key)).slice(0, 2);
    return `
      <div class="rg-x">
        <div class="rg-x-shot">${img ? `<img src="${esc(img)}" alt="">` : ''}</div>
        <div>
          <div class="kicker">${esc(categoryLabel(p.category))}</div>
          <div class="rg-x-name">${esc(p.name)}</div>
          <div class="rg-w">${esc(dimsShort(p))}</div>
          ${v > 0 ? `<div class="rg-pill">${v.toLocaleString('ru')} ${esc(currency)}</div>` : ''}
          <div class="specs">${specs.map(sp =>
            `<div class="row"><span class="k">${esc(sp.key)}</span><span class="v">${esc(sp.value)}</span></div>`).join('')}</div>
        </div>
      </div>`;
  };

  return `
    <div class="range${extras.length ? ' has-x' : ''}">
      <div class="rg-top">
        <div class="rg-hero">${heroImg ? `<img src="${esc(heroImg)}" alt="">` : ''}</div>
        <div class="rg-info">
          <div class="kicker">${esc(categoryLabel(hero.category))}</div>
          <div class="se-name">${esc(title)}</div>
          <div class="specs">${rows.slice(0, 5).map(r =>
            `<div class="row"><span class="k">${esc(r.k)}</span><span class="v">${esc(r.v)}</span></div>`).join('')}</div>
        </div>
      </div>
      <div class="rg-legend">габариты (В×Ш×Г), см / вес</div>
      ${rowsHtml.join('')}
      ${extras.length ? `<div class="rg-extras">${extras.map(extraHtml).join('')}</div>` : ''}
    </div>`;
}

// Товары с одинаковым pdfRange — одна полоса на месте первого, размеры по
// возрастанию объёма. Больше двенадцати — следующая полоса.
function collectRanges(products) {
  const out = [];
  const byKey = new Map();
  products.forEach(p => {
    const key = p?.pdfRange;
    if (!key) { out.push(p); return; }
    if (!byKey.has(key)) { byKey.set(key, []); out.push({ __range: key }); }
    byKey.get(key).push(p);
  });
  const vol = p => (boxDims(p) || [0, 0, 0]).reduce((a, b) => a * b, 1);
  return out.flatMap(p => {
    if (!p?.__range) return [p];
    const extras = byKey.get(p.__range).filter(i => i.pdfRangeExtra);
    let all = byKey.get(p.__range).filter(i => !i.pdfRangeExtra);
    if (!all.length) return extras;
    // Главный — из самой частой категории линейки: подпись и рендер сверху
    // берутся у него, а не у случайного ЩРн или щита без монтажной панели
    const freq = new Map();
    all.forEach(i => freq.set(i.category, (freq.get(i.category) || 0) + 1));
    const mainCat = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    all = [...all.filter(i => i.category === mainCat), ...all.filter(i => i.category !== mainCat)];
    const sorted = [...all].sort((a, b) => vol(a) - vol(b) || (Number(a.price) || 0) - (Number(b.price) || 0));
    const pages = [];
    for (let i = 0; i < sorted.length; i += 12) pages.push({ __rangeBlock: { title: p.__range, items: sorted.slice(i, i + 12), hero: all[0], extras: i ? [] : extras.slice(0, 2) } });
    // Соседей больше двух — остальные обычными карточками сразу за листом
    return [...pages, ...extras.slice(2)];
  });
}

// ── Один лист: pdfPage ───────────────────────────────────────────────────────
// Товары с одинаковым pdfPage — вместе на одной полосе, по две в ряд. Три ряда
// и больше — карточки ниже: кадр меньше, характеристик две строки.
function collectPages(products) {
  const out = [];
  const byKey = new Map();
  products.forEach(p => {
    const key = p?.pdfPage;
    if (!key) { out.push(p); return; }
    if (!byKey.has(key)) { byKey.set(key, []); out.push({ __page: key }); }
    byKey.get(key).push(p);
  });
  return out.flatMap(p => {
    if (!p?.__page) return [p];
    const items = byKey.get(p.__page);
    if (items.length <= PER_PAGE) return items;          // и так влезают на лист
    return [{ __pageBlock: { items: items.slice(0, COLS_PER_PAGE * 4), hero: items[0] } }];
  });
}

function pageBlockHtml({ items }, priceType, currency) {
  const rows = Math.ceil(items.length / COLS_PER_PAGE);
  const rh = (CARD_PITCH * ROWS_PER_PAGE) / rows;
  return `
    <div class="pblock" style="--rh:${rh.toFixed(1)}pt;--ih:${Math.max(rh - 136, 60).toFixed(1)}pt">
      ${items.map((p, i) => {
        const html = cardHtml(p, priceType, currency);
        // Последняя без пары — во всю ширину: фото слева крупно, текст справа
        return rows > ROWS_PER_PAGE && i === items.length - 1 && items.length % COLS_PER_PAGE
          ? html.replace('class="card"', 'class="card card--wide"') : html;
      }).join('')}
    </div>`;
}

function coverHtml(src) {
  return `<section class="page"><div class="sheet cover"><img src="${esc(src)}" alt=""></div></section>`;
}

// ── Полоса ────────────────────────────────────────────────────────────────────
function pageHtml(cards, setName, pageNumber, priceType, currency) {
  // Логотип уходит к внешнему краю разворота — по настоящему номеру полосы.
  const logoLeft = pageNumber % 2 === 1;
  const logo = '<img class="logo" src="/logos/logo-main.png" alt="MATKASYM">';
  const title = `<div class="set">${esc(setName)}</div>`;

  return `
    <section class="page">
      <div class="sheet">
        <header class="phead">${logoLeft ? logo + title : title + logo}</header>
        <div class="grid">
          ${cards.map(c => (c?.__pageBlock ? pageBlockHtml(c.__pageBlock, priceType, currency)
            : c?.__rangeBlock ? rangeHtml(c.__rangeBlock, priceType, currency)
            : c?.__seriesBlock ? seriesHtml(c.__seriesBlock, priceType, currency) : cardHtml(c, priceType, currency))).join('')}
        </div>
      </div>
    </section>`;
}

// ── Стили ─────────────────────────────────────────────────────────────────────
// Всё в пунктах: полоса A4 — 595 × 842 pt, поэтому размеры совпадают с макетом
// один в один, без пересчётов в пиксели.
const css = `
@font-face { font-family: Roboto; src: url('/fonts/Roboto-Regular.ttf'); font-weight: 400; }
@font-face { font-family: Roboto; src: url('/fonts/Roboto-Medium.ttf');  font-weight: 500; }
@font-face { font-family: Roboto; src: url('/fonts/Roboto-Bold.ttf');    font-weight: 700; }

@page { size: A4; margin: 0; }

/* Панель поверх каталога. На бумагу не идёт — при печати её нет.
   Без неё на открытой вкладке не за что взяться: если диалог печати не
   появился или его закрыли, страница выглядела тупиком. */
.bar {
  position: fixed;
  bottom: 16px; right: 16px;
  z-index: 99;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(20, 24, 28, .92);
  box-shadow: 0 6px 24px rgba(0, 0, 0, .28);
  font-family: Roboto, Arial, sans-serif;
}
.bar b {
  font-size: 12px;
  font-weight: 500;
  color: #cbd3d8;
  padding-right: 2px;
}
.bar button {
  border: 0;
  border-radius: 7px;
  padding: 8px 14px;
  background: ${RED};
  color: #fff;
  font: 700 13px Roboto, Arial, sans-serif;
  cursor: pointer;
}
.bar button:hover { filter: brightness(1.08); }
.bar button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

@media print { .bar { display: none !important; } }

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  background: #fff;
  font-family: Roboto, Arial, sans-serif;
  color: ${INK};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Лист чуть меньше A4. При ровном A4 движки печати из-за округления считают
   его на волос выше листа и вставляют между полными полосами пустые. Запас
   снизу не виден: нижний ряд карточек кончается заметно выше.

   Вся вёрстка внутри снята с макета в пунктах и на размер листа не смотрит,
   поэтому под чужую область печати лист не перестраивается, а ужимается
   целиком — множителем --k. На компьютере он равен единице: там в диалоге
   печати ставят поля «Нет», и лист ложится на A4 один в один. */
:root { --k: 1; }

.page {
  width: calc(209.9mm * var(--k));
  height: calc(296.4mm * var(--k));
  overflow: hidden;
  break-after: page;
  page-break-after: always;
}
.page:last-child { break-after: auto; page-break-after: auto; }

.sheet {
  position: relative;
  width: 209.9mm;
  height: 296.4mm;
  padding: 0 ${PAGE_W - MARGIN_L - COL_W * 2 - GUTTER}pt 0 ${MARGIN_L}pt;
  overflow: hidden;
  transform: scale(var(--k));
  transform-origin: top left;
}

/* ── Обложка ─────────────────────────────────────────────────────────────── */
.cover { padding: 0; }
.cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ── Шапка ───────────────────────────────────────────────────────────────── */
.phead {
  position: absolute;
  left: ${MARGIN_L}pt;
  right: ${PAGE_W - MARGIN_L - COL_W * 2 - GUTTER}pt;
  top: ${HEAD_TOP}pt;
  height: ${HEAD_RULE_Y - HEAD_TOP}pt;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 0.5pt solid ${RULE};
}
.logo { height: 13.25pt; width: auto; display: block; }
.set  { font-size: 15pt; font-weight: 700; line-height: 1; letter-spacing: 0.1pt; }

/* ── Сетка карточек ──────────────────────────────────────────────────────── */
.grid {
  position: absolute;
  left: ${MARGIN_L}pt;
  top: ${CARD_TOP}pt;
  display: grid;
  grid-template-columns: repeat(${COLS_PER_PAGE}, ${COL_W}pt);
  grid-auto-rows: ${CARD_PITCH}pt;
  column-gap: ${GUTTER}pt;
  row-gap: 0;
}

/* Жёсткая высота — страховка: что бы ни пришло в данных, карточка не вылезет
   за свою ячейку и не сломает полосу. */
.card {
  width: ${COL_W}pt;
  height: ${CARD_PITCH}pt;
  overflow: hidden;
}
.card--empty { visibility: hidden; }

/* ── Снимок ──────────────────────────────────────────────────────────────── */
/* Товар стоит на нижней кромке кадра, а не висит по центру: в макете все
   снимки на полосе выровнены по одной линии, как на витрине. */
.shot {
  height: ${IMG_H}pt;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.shot img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
/* Краска без снимка — кадр заливается её цветом. Тонкая рамка нужна светлым
   (белая, молочная): без неё образец сливается с листом. */
.shot-color {
  width: 100%;
  height: 100%;
  border-radius: 6pt;
  box-shadow: inset 0 0 0 0.75pt ${RULE};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* Товар без снимка. Пустой кадр читается как брак печати, поэтому место
   занимает спокойная заглушка — в высоту кадра, чтобы полоса не поехала. */
.shot-none {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0.75pt dashed ${RULE};
  border-radius: 6pt;
  color: ${RULE};
  font-size: 9pt;
  letter-spacing: .3pt;
}

/* ── Кружки-образцы цвета ────────────────────────────────────────────────── */
.swatches {
  height: 17.5pt;
  margin-top: 4pt;
  display: flex;
  justify-content: flex-end;
  gap: 2.3pt;
}
.sw {
  width: 17.5pt;
  height: 17.5pt;
  border-radius: 50%;
  border: 0.75pt solid ${RULE};
}

/* ── Название, кикер, цена ───────────────────────────────────────────────── */
.head {
  margin-top: 6.5pt;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8pt;
  padding-bottom: 8pt;
  border-bottom: 1.5pt solid ${RULE};
}
.kicker { font-size: 7pt; line-height: 1.35; }
/* Не больше двух строк: названия в базе бывают в четыре строки
   («Кронштейн P4 для телевизоров и мониторов 32-65 дюймов настенный»), и такая
   карточка выталкивала характеристики за пределы полосы. */
.name {
  font-size: 15pt;
  font-weight: 700;
  line-height: 1.15;
  margin-top: 1pt;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.head-r { flex: 0 0 auto; text-align: left; }
.plabel { font-size: 6.5pt; line-height: 1.35; margin-bottom: 1pt; }
.pill {
  width: 70pt;
  height: 18.8pt;
  border-radius: 3pt;
  background: ${RED};
  color: #fff;
  font-size: 11pt;
  line-height: 18.8pt;
  text-align: center;
  white-space: nowrap;
}

/* ── Характеристики ──────────────────────────────────────────────────────── */
.specs { margin-top: 6.8pt; }
.row {
  height: 18.8pt;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10pt;
  border-bottom: 0.5pt solid ${RULE};
  font-size: 10.3pt;
}
.row .k { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .v { flex: 0 0 auto; font-weight: 500; text-align: right; white-space: nowrap; }

/* ── Серия: блок на весь ряд ─────────────────────────────────────────────── */
/* Слева главная модель: крупный снимок, под ним её подпись с ценой и общие
   характеристики серии. Справа название серии и остальные модели по две. */
.series {
  grid-column: 1 / -1;
  height: ${CARD_PITCH}pt;
  overflow: hidden;
  display: grid;
  grid-template-columns: ${COL_W}pt ${COL_W}pt;
  column-gap: ${GUTTER}pt;
}
.se-left { display: flex; flex-direction: column; min-width: 0; }
.se-hero { height: 232pt; display: flex; align-items: flex-end; justify-content: center; }
.se-hero img { max-width: 100%; max-height: 100%; object-fit: contain; }
.se-cap {
  margin-top: 10pt; padding-bottom: 8pt; border-bottom: 1.5pt solid ${RULE};
  display: flex; align-items: flex-end; justify-content: space-between; gap: 8pt;
}
.se-code { font-size: 15pt; font-weight: 700; line-height: 1.15; }
.se-cap .sv-note { margin-top: 2pt; }
.se-left .specs { margin-top: 4pt; }

.se-right { min-width: 0; display: flex; flex-direction: column; }
.se-name {
  font-size: 19pt; font-weight: 700; line-height: 1.1; margin-top: 1pt;
  padding-bottom: 8pt; border-bottom: 1.5pt solid ${RULE};
}
.se-others {
  margin-top: 12pt;
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 14pt;
  row-gap: 12pt;
}
.sv { min-width: 0; text-align: center; }

/* ── Один лист (pdfPage): мельче карточки, по две в ряд ──────────────────── */
.pblock {
  grid-column: 1 / -1;
  grid-row: span ${ROWS_PER_PAGE};
  height: ${CARD_PITCH * ROWS_PER_PAGE}pt;
  display: grid;
  grid-template-columns: repeat(${COLS_PER_PAGE}, ${COL_W}pt);
  grid-auto-rows: var(--rh);
  column-gap: ${GUTTER}pt;
  overflow: hidden;
}
.pblock .card { height: var(--rh); }
.pblock .shot { height: var(--ih); margin-top: 12pt; }
.pblock .specs .row:nth-child(n+3) { display: none; }
.pblock .card--wide {
  grid-column: 1 / -1;
  width: auto;
  display: grid;
  grid-template-columns: ${COL_W}pt ${COL_W}pt;
  grid-template-rows: 1fr auto auto auto 1fr;
  column-gap: ${GUTTER}pt;
}
.pblock .card--wide .shot { grid-column: 1; grid-row: 1 / -1; height: calc(var(--rh) - 34pt); margin-top: 10pt; }
.pblock .card--wide .swatches { grid-column: 2; grid-row: 2; }
.pblock .card--wide .head { grid-column: 2; grid-row: 3; }
.pblock .card--wide .specs { grid-column: 2; grid-row: 4; }
.pblock .card--wide .specs .row:nth-child(n+3) { display: flex; }

/* ── Линейка размеров: вся полоса ────────────────────────────────────────── */
.range {
  grid-column: 1 / -1;
  grid-row: span 2;
  height: ${CARD_PITCH * 2}pt;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.rg-top {
  display: grid;
  grid-template-columns: ${COL_W}pt ${COL_W}pt;
  column-gap: ${GUTTER}pt;
  height: 330pt;
}
.range.has-x .rg-top { height: 236pt; }
.range.has-x .rg-hero img { max-height: 226pt; }
.range.has-x .rg-legend { margin-top: 8pt; }
.range.has-x .rg-row { margin-top: 10pt; }
.rg-extras {
  margin-top: auto; padding-top: 10pt; border-top: 0.5pt solid ${RULE};
  display: grid; grid-template-columns: ${COL_W}pt ${COL_W}pt; column-gap: ${GUTTER}pt;
}
.rg-x { display: grid; grid-template-columns: 96pt 1fr; column-gap: 10pt; align-items: center; }
.rg-x-shot { height: 96pt; display: flex; align-items: center; justify-content: center; }
.rg-x-shot img { max-width: 100%; max-height: 100%; object-fit: contain; }
.rg-x-name { font-size: 11pt; font-weight: 700; line-height: 1.15; margin: 1pt 0 2pt; }
.rg-x .rg-pill { margin: 3pt 0 2pt; }
.rg-x .row { height: 15pt; font-size: 8pt; }
.rg-hero { display: flex; align-items: center; justify-content: center; }
.rg-hero img { max-width: 100%; max-height: 320pt; object-fit: contain; }
.rg-info { display: flex; flex-direction: column; justify-content: center; }
.rg-info .specs { margin-top: 6pt; }
.rg-legend {
  margin-top: 18pt; padding-bottom: 5pt; border-bottom: 0.5pt solid ${RULE};
  font-size: 9pt; color: #5a6a6d;
}
.rg-row {
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  margin-top: 16pt;
}
.rg-cell { min-width: 0; text-align: center; padding: 0 4pt; }
.rg-box { height: var(--bh, 124pt); display: flex; align-items: flex-end; justify-content: center; }
.rg-dims { margin-top: 7pt; font-size: 10pt; font-weight: 500; line-height: 1.2; }
.rg-note { font-size: 7.5pt; line-height: 1.25; }
.rg-w { font-size: 8pt; line-height: 1.3; color: #5a6a6d; }
.rg-plabel { margin-top: 4pt; font-size: 6.5pt; line-height: 1.3; }
.rg-pill {
  display: inline-block; padding: 0 7pt; height: 16pt; line-height: 16pt; border-radius: 3pt;
  background: ${RED}; color: #fff; font-size: 10pt; white-space: nowrap;
}
/* Одна-две модели справа — один ряд: снимки крупнее, чтобы не пустовал низ */
.se-others.few { margin-top: 20pt; }
.se-others.few .sv-shot { height: 190pt; }
.sv-shot { height: 92pt; display: flex; align-items: flex-end; justify-content: center; }
.sv-shot img { max-width: 100%; max-height: 100%; object-fit: contain; }
.sv-code { margin-top: 6pt; font-size: 10.5pt; font-weight: 700; line-height: 1.15; }
.sv-note { margin-top: 1.5pt; font-size: 8pt; line-height: 1.25; }
.sv-dims { font-size: 7.5pt; line-height: 1.3; color: #5a6a6d; }
.sv-pill {
  display: inline-block; margin-top: 4pt; padding: 0 6pt;
  height: 15pt; line-height: 15pt; border-radius: 3pt;
  background: ${RED}; color: #fff; font-size: 9pt; white-space: nowrap;
}
`;

// ── Сборка документа ──────────────────────────────────────────────────────────
// Товары идут одним потоком: раздел полосу не рвёт. Так свёрстан макет — в шапке
// стоит сет, а категория подписана кикером над названием, и на одной полосе
// спокойно соседствуют гладильные доски, корзины и вешалки.
//
// Пока каждый раздел начинался с новой полосы, категория из двух товаров
// («Тумбы») занимала целую полосу с пустым нижним рядом, а из одного («Сейф») —
// полосу почти пустую. На двадцати четырёх сетах так терялось около десяти полос.
// headFromGroups — чем подписана шапка полосы:
//   true  — именем группы: так выгружают бренд целиком, и группы там сеты;
//   false — общим названием: так выгружают один сет, а группы в нём категории.
// В шапке всегда должен стоять сет: категорию читают кикером над названием.
// Иначе полоса с двумя тумбами и одним стеллажом подписывалась «Стеллажи».
function buildPages(groups, setName, priceType, currency, headFromGroups) {
  const stream = [];
  groups.forEach(group => {
    const section = headFromGroups ? (group.groupName || setName) : setName;
    (group.products || []).forEach(product => stream.push({ product, section }));
  });

  // Внутри одного рода товаров (все «шкафы»: гардеробные, офисные, инструментальные,
  // карточные; все «урны») сначала идут серии, потом одиночные карточки — иначе
  // одиночный шкаф стоял между сериями, а после него опять серии. Род берём по
  // слову в категории; порядок внутри серий и внутри одиночных не меняется.
  const KIND = /шкаф|урн|тумб|стеллаж|скамейк|бак|щит|кронштейн|вешалк/;
  const kindOf = x => {
    const p = x.product?.__seriesBlock?.hero || x.product?.__rangeBlock?.hero || x.product?.__pageBlock?.hero || x.product;
    const c = String(p?.category || '').toLowerCase();
    return `${x.section}|${c.match(KIND)?.[0] || c}`;
  };
  for (let i = 0; i < stream.length;) {
    let j = i;
    while (j < stream.length && kindOf(stream[j]) === kindOf(stream[i])) j++;
    const run = stream.slice(i, j);
    // Порядок задан руками (pdfOrder) — не переставляем
    if (run.some(x => hasPdfOrder(x.product?.__seriesBlock?.hero || x.product?.__rangeBlock?.hero || x.product?.__pageBlock?.hero || x.product))) { i = j; continue; }
    const big = x => x.product?.__seriesBlock || x.product?.__rangeBlock;
    const series = run.filter(big);
    if (series.length) stream.splice(i, run.length, ...series, ...run.filter(x => !big(x)));
    i = j;
  }

  // Серия занимает целый ряд (две ячейки) и встаёт с начала ряда: если ряд уже
  // начат карточкой, его вторая ячейка остаётся пустой.
  const pages = [];
  let cards = [], used = 0, section = '';
  const flush = (pad = true) => {
    if (!cards.length) return;
    if (pad) { while (used < PER_PAGE) { cards.push(null); used++; } }
    // Раздел, действующий к концу полосы: если новый начался в первой карточке,
    // вся полоса уже про него.
    pages.push(pageHtml(cards, section, pages.length + 1, priceType, currency));
    cards = []; used = 0;
  };
  // Разные роды товаров на одном листе не печатаем: фонарь рядом с
  // велопарковкой читается как случайный набор. Род — по слову в категории;
  // категории без рода (их большинство) друг другу лист не ломают.
  const FAMILIES = [
    ['seat', /скамейк|навес|лавк|стул|кресл|диван/],
    ['light', /освещ|фонар|светил|прожектор|опор/],
    ['bike', /вело/],
    ['waste', /урн|бак|мусор|контейнер/],
    // Щиты: серийные (настенные, ЩМП, распред.) и индивидуальные (этажные,
    // сантехнические, пожарные) — на разных листах
    ['panel-custom', /этаж|сантех|пожар/],
    ['panel', /электрощит|распред|щмп|монтажн|щит/],
  ];
  const familyOf = product => {
    const p = product?.__seriesBlock?.hero || product?.__rangeBlock?.hero || product?.__pageBlock?.hero || product;
    const c = String(p?.category || '').toLowerCase();
    return FAMILIES.find(([, re]) => re.test(c))?.[0] || '';
  };
  let family = '';
  stream.forEach(({ product, section: sec }) => {
    // Каждый сет — с нового листа: сет с сетом на одной полосе не делят
    if (sec !== section && used) flush();
    const fam = familyOf(product);
    if (fam && family && fam !== family && used && sec === section) flush();
    if (fam) family = fam;
    // Линейка — целая полоса: начинается с новой страницы
    const span = product?.__rangeBlock || product?.__pageBlock ? PER_PAGE : product?.__seriesBlock ? COLS_PER_PAGE : 1;
    if (span === PER_PAGE && used) flush();
    if (span > 1 && used % COLS_PER_PAGE) { cards.push(null); used++; }
    if (used + span > PER_PAGE) flush();
    cards.push(product); used += span; section = sec;
    if (used >= PER_PAGE) flush();
  });
  flush(false);

  return pages.join('');
}

// Телефон печатает своим диалогом, и поля листа там не отключить: Safari и
// Chrome на Android держат около сантиметра с каждой стороны. Лист ровно в A4
// в такую область не влезает — за каждой полосой печаталась пустая. Ужимаем
// лист до 0.88: это 185x261 мм, они помещаются в область печати с запасом.
const MOBILE = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MOBILE_K = 0.88;

/**
 * Открывает каталог отдельной вкладкой и вызывает печать; в диалоге выбирают
 * «Сохранить как PDF». Поля поставить «Нет», фоновую графику включить, иначе
 * красная плашка цены напечатается белой. Кнопка есть и на самой странице.
 *
 */
// Цвет варианта: из последних скобок названия («… (Темно-серый)»), иначе поле color
const variantColor = p => {
  const m = String(p.name || '').match(/\(([^()]+)\)\s*$/);
  // «(Зеленая)», «(Синяя)» → «Зеленый», «Синий»: образцы знают мужской род
  const c = (m ? m[1] : p.color || '').trim().replace(/ая$/i, 'ый').replace(/яя$/i, 'ий');
  return /^#[0-9a-f]{6}$/i.test(c) ? '' : c;
};

// Варианты одной модели HOME (цвет, размер в названии) — одной карточкой, как
// на экране сета: название без цвета и размера, фото первого с фото, снизу
// строки вариантов. Цена одинаковая — одна на карточке, разная — у каждой строки.
// Ручная склейка (pdfGroup) и комплекты сюда не попадают.
function mergeHomeVariants(products) {
  const out = [];
  const byKey = new Map();
  products.forEach(p => {
    if (!p || p.brand !== 'matkasym-home' || p.isKit || p.pdfGroup || p.__variants) { out.push(p); return; }
    const key = `${p.category || ''}|${variantKey(p.name)}`;
    if (!byKey.has(key)) { byKey.set(key, []); out.push({ __homeKey: key }); }
    byKey.get(key).push(p);
  });
  return out.flatMap(p => {
    if (!p?.__homeKey) return [p];
    const items = byKey.get(p.__homeKey);
    if (new Set(items.map(i => i.name)).size < 2) {
      // Даже без слияния подставляем обложку с сайта, чтобы фото совпадало
      const sc = items.find(i => i.__siteCover)?.__siteCover;
      if (sc) return items.map(i => i.images?.[0] === sc ? i : { ...i, images: [sc, ...(i.images || []).filter(u => u !== sc)] });
      return items;
    }
    // Фото — то же, что на обложке карточки на сайте: экран сета передаёт его
    // в __siteCover (там видны и варианты без остатка), иначе — тем же правилом
    const cover = items.find(hasPhoto) || items[0];
    const siteImg = items.find(i => i.__siteCover)?.__siteCover || coverOf(items)?.images?.[0];
    const title = variantTitle(cover.name);
    const merged = { ...cover, name: title, fullName: title, dimensions: '',
      images: siteImg ? [siteImg, ...(cover.images || []).filter(u => u !== siteImg)] : cover.images,
      color: [...new Set(items.map(i => i.color).filter(Boolean))].join(', '),
      specs: (cover.specs || []).filter(s => !/^цвет$/i.test(s.key || '')) };
    merged.__variants = items.map(i => ({ label: variantLabel(i, items), price: i.price,
      priceWholesale: i.priceWholesale, priceDealer: i.priceDealer, priceUndefined: i.priceUndefined }));
    merged.__homeVariants = true;
    return [merged];
  });
}

// Товары с одинаковым pdfGroup печатаются одной карточкой: фото и характеристики
// первого (в порядке сета), название — сам pdfGroup, цвета всех — строкой «цвет»
// с кружками-образцами. Цена — общая, а если разная, то меньшая.
function mergePdfGroups(products) {
  const out = [];
  const byKey = new Map();
  products.forEach(p => {
    const key = p?.pdfGroup;
    if (!key) { out.push(p); return; }
    if (!byKey.has(key)) { byKey.set(key, []); out.push({ __pdfGroup: key }); }
    byKey.get(key).push(p);
  });
  return out.flatMap(p => {
    if (!p?.__pdfGroup) return [p];
    const items = byKey.get(p.__pdfGroup);
    // Фото карточки — у первого с фото; группу совсем без фото не печатаем
    const cover = items.find(hasPhoto);
    if (!cover) return [];
    const colors = [...new Set(items.map(variantColor).filter(Boolean))];
    const minOf = f => Math.min(...items.map(i => Number(i[f]) || Infinity));
    const merged = { ...cover, name: p.__pdfGroup, fullName: p.__pdfGroup,
      specs: (cover.specs || []).filter(s => !/^цвет$/i.test(s.key)),
      color: colors.map(c => c.toLowerCase()).join(', ') };
    ['price', 'priceWholesale', 'priceDealer'].forEach(f => { const v = minOf(f); if (Number.isFinite(v)) merged[f] = v; });

    // Варианты-размеры: строка на каждый с его ценой, от дешёвого к дорогому.
    // Габариты у них разные — их не печатаем, из характеристик оставляем общие.
    if (items.some(i => i.pdfVariant)) {
      merged.__variants = [...items]
        .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))
        .map(i => ({ label: i.pdfVariant || i.name, price: i.price, priceWholesale: i.priceWholesale,
                     priceDealer: i.priceDealer, priceUndefined: i.priceUndefined }));
      const norm = s => String(s?.value ?? '').trim().toLowerCase();
      merged.specs = (cover.specs || []).filter(s => s?.value && !/^цвет$/i.test(s.key)
        && items.every(i => (i.specs || []).some(t => t.key?.toLowerCase() === s.key?.toLowerCase() && norm(t) === norm(s))));
      merged.dimensions = '';
    }
    return [merged];
  });
}

export async function printCatalog(groups, setName, priceType = 'price', brand = 'home', currency = 'сом',
                                   { headFromGroups = true } = {}) {
  // <base> обязателен: окно открывается как about:blank, и без него относительные
  // пути к шрифтам и логотипу разрешаются не от адреса сайта — печать уходит
  // системным шрифтом и без знака.
  const cover = COVERS[brand] || COVERS.home;
  const mobile = MOBILE();
  await loadCategoryLabels();
  groups = await withPdfDetails(groups);
  groups = byPdfOrder(groups, headFromGroups)
    .map(g => ({ ...g, products: collectPages(collectRanges(collectSeries(mergeHomeVariants(mergePdfGroups(g.products || []))))) }));

  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<base href="${location.origin}/">
<title>Каталог — ${esc(setName)}</title>
<style>${css}</style>
${mobile ? `<style>:root { --k: ${MOBILE_K}; }</style>` : ''}
</head><body>
<div class="bar">
  <b>${mobile
    ? 'Полосы ужаты под поля телефона; каталог в полный лист печатают с компьютера'
    : 'Поля — «Нет», фоновая графика — включена'}</b>
  <button type="button" onclick="window.print()">Сохранить PDF</button>
</div>
${coverHtml(cover.title)}
${buildPages(groups, setName, priceType, currency, headFromGroups)}
${coverHtml(cover.end)}</body></html>`;

  const win = window.open('', '_blank');
  if (!win) throw new Error('Браузер заблокировал новое окно — разрешите всплывающие окна для сайта');

  win.document.open();
  win.document.write(html);
  win.document.close();

  // Печать только после того, как приехали все снимки: Chrome печатает то, что
  // отрисовано на момент вызова, и недогруженные картинки выйдут пустыми.
  await new Promise(resolve => {
    const done = () => resolve();
    if (win.document.readyState === 'complete') queueMicrotask(done);
    else win.addEventListener('load', done, { once: true });
  });

  const images = Array.from(win.document.images);
  await Promise.all(images.map(img => img.complete
    ? Promise.resolve()
    : new Promise(res => { img.addEventListener('load', res, { once: true });
                           img.addEventListener('error', res, { once: true }); })));

  // Шрифты грузятся отдельно от разметки: без ожидания первая печать уходит
  // системным шрифтом, и кегли разъезжаются.
  if (win.document.fonts?.ready) await win.document.fonts.ready;

  win.focus();
  win.print();
}

// Общее с каталогом услуг (servicesPrint.js): обложки, экранирование, снимок под печать
export { COVERS as PRINT_COVERS, esc as printEsc, printImg as printImage };
