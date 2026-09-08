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

// ── Словари ───────────────────────────────────────────────────────────────────
const PRICE_LABELS = {
  price:          'рознич. цена',
  priceWholesale: 'оптовая цена',
  priceDealer:    'дилерская цена',
};

// Цвет из поля товара — в кружок-образец. Слова встречаются и по-русски,
// и по-английски: в базе поле заполняют руками.
const COLOR_HEX = {
  'белый': '#FFFFFF', 'white': '#FFFFFF',
  'черный': '#1A1A1A', 'чёрный': '#1A1A1A', 'black': '#1A1A1A',
  'серый': '#8A8A8A', 'grey': '#8A8A8A', 'gray': '#8A8A8A',
  'серебристый': '#C0C0C0', 'silver': '#C0C0C0',
  'красный': '#D32F2F', 'red': '#D32F2F',
  'синий': '#1565C0', 'blue': '#1565C0',
  'зеленый': '#2E7D32', 'зелёный': '#2E7D32', 'green': '#2E7D32',
  'бежевый': '#D4B896', 'beige': '#D4B896',
  'коричневый': '#795548', 'brown': '#795548',
  'золотой': '#D4AF37', 'gold': '#D4AF37',
};

const CATEGORY_LABELS = {
  'clothes-dryer': 'сушилка для белья', 'laundry-basket': 'корзина для белья',
  'ironing-board': 'гладильная доска', 'wardrobe-rack': 'гардеробная вешалка',
  'coat-hanger': 'костюмная вешалка', 'shoe-rack': 'обувная полка',
  'wall-hanger': 'настенная вешалка', 'toilet-shelf': 'полка для туалета',
  'bath-shelf': 'полка для ванной', 'bath-corner-shelf': 'угловая полка',
  'flower-stand': 'подставка для цветов', 'bbq-grill': 'мангал',
  'antenna': 'антенна', 'tv-bracket': 'кронштейн для TV',
  'electric-panel': 'электрощит', 'wall-shelf': 'настенная полка',
  'hook': 'крючки', 'organizer-kitchen': 'кухонный органайзер',
  'dish-drainer': 'сушилка для посуды', 'school-desk': 'школьная парта',
  'school-chair': 'школьный стул', 'ladder': 'стремянка',
  'industrial-shelf': 'промышленный стеллаж', 'storage-tumba': 'тумба',
  'ac-basket': 'корзина для кондиционера', 'ac-mount': 'кронштейн для кондиционера',
  'appliances': 'бытовая техника', 'clothing-racks': 'вешалка для одежды',
  'cosmetics-storage': 'хранение косметики', 'floor-hanger': 'напольная вешалка',
  'home-decor': 'декор для дома', 'jewelry-storage': 'хранение украшений',
  'kids': 'детские товары', 'mosquito-nets': 'москитная сетка',
  'play-tents': 'игровая палатка', 'shelf-corner': 'угловая полка',
  'shoe-racks': 'полка для обуви', 'stools': 'табурет', 'storage': 'хранение',
  'tv-mount': 'кронштейн для TV', 'waste-bin': 'урна',
  'other': '',
};

/**
 * Что попадает в каталог. Один фильтр на все выгрузки — раньше он был размножен
 * по кнопкам и смотрел только на остаток, из-за чего в каталог выходило лишнее.
 *
 * Не берём:
 *  · детали зависимого комплекта (kit_part) — их продают в составе комплекта,
 *    а не порознь; парта и стул уже показаны карточкой «ALA-TOO парта, стул»;
 *  · товары «в пути»: на складе их ещё нет, продавать по каталогу нечего.
 *
 * Фотография в каталог не пропуск: без снимка лежит каждый восьмой товар с
 * остатком (краски, стеллажи ADIK, щиты), и требование фото вычёркивало их из
 * выгрузки целиком. Товар с остатком в каталоге нужен — вместо пустого кадра
 * ему рисуется заглушка «фото готовится».
 */
export const fitsCatalog = p =>
  Boolean(p)
  && p.productStatus !== 'kit_part'
  && (p.inStock || p.stock > 0 || p.isOnOrder || p.productStatus === 'test_sale');

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

// ── Карточка ──────────────────────────────────────────────────────────────────
function cardHtml(product, priceType, currency) {
  if (!product) return '<div class="card card--empty"></div>';

  const img = printImg(product.images?.[0]);
  const kicker = CATEGORY_LABELS[product.category] ?? product.category ?? '';

  // Порядок строк как в макете: сначала габариты, потом характеристики товара.
  const rows = [];
  if (product.dimensions) rows.push({ k: 'габариты (ДхШхВ)', v: product.dimensions });
  (product.specs || []).forEach(s => {
    if (s?.value && !rows.some(r => r.k === s.key)) {
      rows.push({ k: s.key, v: s.unit ? `${s.value} ${s.unit}` : s.value });
    }
  });
  if (product.color && !rows.some(r => /цвет/i.test(r.k))) {
    rows.push({ k: 'цвет', v: product.color });
  }

  // Кружки-образцы над текстом, как в макете: цвет может быть перечислением.
  const swatches = String(product.color || '')
    .split(/[,/]/).map(c => c.trim().toLowerCase()).filter(Boolean)
    .map(c => COLOR_HEX[c]).filter(Boolean);

  const value = priceType !== 'none' ? Number(product[priceType]) || 0 : 0;

  return `
    <div class="card">
      <div class="shot">${img
        ? `<img src="${esc(img)}" alt="">`
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
        rows.slice(0, 4).map(r =>
          `<div class="row"><span class="k">${esc(r.k)}</span><span class="v">${esc(r.v)}</span></div>`
        ).join('')
      }</div>
    </div>`;
}

// ── Полоса ────────────────────────────────────────────────────────────────────
function pageHtml(cards, setName, pageNumber, priceType, currency) {
  // Логотип уходит к внешнему краю разворота — по настоящему номеру полосы.
  const logoLeft = pageNumber % 2 === 1;
  const logo = '<img class="logo" src="/logos/logo-main.png" alt="MATKASYM">';
  const title = `<div class="set">${esc(setName)}</div>`;

  return `
    <section class="page">
      <header class="phead">${logoLeft ? logo + title : title + logo}</header>
      <div class="grid">
        ${cards.map(c => cardHtml(c, priceType, currency)).join('')}
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

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  background: #fff;
  font-family: Roboto, Arial, sans-serif;
  color: ${INK};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Полоса чуть меньше листа. При ровном A4 движки печати из-за округления
   считают её на волос выше листа и вставляют между полными полосами пустые —
   на телефоне это было видно особенно. Запас снизу не виден: нижний ряд
   карточек кончается заметно выше. */
.page {
  position: relative;
  width: 209.9mm;
  height: 296.4mm;
  padding: 0 ${PAGE_W - MARGIN_L - COL_W * 2 - GUTTER}pt 0 ${MARGIN_L}pt;
  overflow: hidden;
  break-after: page;
  page-break-after: always;
}
.page:last-child { break-after: auto; page-break-after: auto; }

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

  const pages = [];
  for (let i = 0; i < stream.length; i += PER_PAGE) {
    const chunk = stream.slice(i, i + PER_PAGE);
    // Раздел, действующий к концу полосы: если новый начался в первой карточке,
    // вся полоса уже про него.
    const section = chunk[chunk.length - 1].section;
    const cards = chunk.map(x => x.product);
    while (cards.length < PER_PAGE) cards.push(null);
    pages.push(pageHtml(cards, section, pages.length + 1, priceType, currency));
  }

  return pages.join('');
}

/**
 * Собирает каталог и отдаёт его одним из двух способов:
 *
 *   mode: 'print' — открывает отдельной вкладкой и вызывает печать; в диалоге
 *     выбирают «Сохранить как PDF». Поля поставить «Нет», фоновую графику
 *     включить, иначе красная плашка цены напечатается белой.
 *
 *   mode: 'html'  — сразу скачивает файлом, без диалога. Внутри стоит <base>
 *     на адрес сайта, поэтому шрифты, знак и снимки подтягиваются и в
 *     скачанном файле; открыть его можно в любом браузере и оттуда же напечатать.
 */
export async function printCatalog(groups, setName, priceType = 'price', brand = 'home', currency = 'сом',
                                   { headFromGroups = true, mode = 'print' } = {}) {
  // <base> обязателен: окно открывается как about:blank, и без него относительные
  // пути к шрифтам и логотипу разрешаются не от адреса сайта — печать уходит
  // системным шрифтом и без знака.
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<base href="${location.origin}/">
<title>Каталог — ${esc(setName)}</title>
<style>${css}</style>
</head><body>${buildPages(groups, setName, priceType, currency, headFromGroups)}</body></html>`;

  if (mode === 'html') {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `matkasym-catalog-${setName.toLowerCase().replace(/\s+/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

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
