/**
 * Базы 1С, из которых грузятся остатки.
 *
 * Один и тот же товар лежит в нескольких базах (33 позиции есть и в Matkasym, и в Q-top),
 * поэтому у каждой базы свой ключ в Product.stockByBase, а Product.stock — их сумма.
 *
 * Форматы выгрузок у баз разные, поэтому у каждой свой профиль:
 *   headerCell — что стоит в колонке A строки-шапки (по ней ищем шапку);
 *   trimUnit   — резать ли хвост «, шт» / «, кг» из названия товара;
 *   warehouses — какие склады входят в остаток для сайта. Всё остальное игнорируем:
 *                цеха — это незавершёнка, а «Виртуальный склад» всегда отрицательный
 *                (техническая отгрузка) и утягивает «Итого» в минус.
 */

// Типы цен. Набор у баз разный: у Matkasym, например, розничной нет вообще —
// он продаёт дилерам и оптовикам, а в Казахстан — по экспортному прайсу в долларах.
// legacyField — поле товара, куда цена Make-in пишется дополнительно: на неё завязан
// весь остальной сайт, и сотрудникам показывается именно она.
// c1Pattern — как тип цены называется в 1С («Типы цен номенклатуры»).
// «Оптовая» матчится строго: рядом живёт «Оптовая цена с учётом НДС», это другая цена.
const PRICE_TYPES = {
  retail:    { key: 'retail',    label: 'Розничные цены',  legacyField: 'price',          c1Pattern: /^розничная/i },
  wholesale: { key: 'wholesale', label: 'Оптовые цены',    legacyField: 'priceWholesale', c1Pattern: /^оптовая$/i },
  dealer:    { key: 'dealer',    label: 'Дилерские цены',  legacyField: 'priceDealer',    c1Pattern: /^дилерская/i },
  cost:      { key: 'cost',      label: 'Закупочные цены', legacyField: 'priceCost',      c1Pattern: /^закупочная/i },
  export:    { key: 'export',    label: 'Экспорт прайс лист', currency: 'USD',            c1Pattern: /экспорт/i },
};
const PRICE_TYPE_KEYS = Object.keys(PRICE_TYPES);
const isPriceType = t => Object.prototype.hasOwnProperty.call(PRICE_TYPES, t);

const BASES = {
  makein: {
    key:     'makein',
    label:   'Make-in',
    country: 'KG',
    currency: 'KGS',
    priceTypes: ['retail', 'wholesale', 'dealer', 'cost'],
    // Разбирается старым detectStockColumns в routes/admin.js — формат не трогаем
    legacyParser: true,
  },
  matkasym: {
    key:        'matkasym',
    label:      'Matkasym',
    country:    'KG',
    currency:   'KGS',
    // Розничной нет: Matkasym продаёт дилерам и оптовикам, а в KZ — по экспортному прайсу (USD)
    priceTypes: ['dealer', 'wholesale', 'cost', 'export'],
    headerCell: 'товар, ед.изм',
    trimUnit:   true,
    warehouses: [/склад\s+гп/i],   // «9,Склад ГП» + «11. Склад  ГП Маткасым Шаар»
  },
  qtop: {
    key:        'qtop',
    label:      'Matkasym KZ',
    country:    'KZ',              // склад, остаток и учёт — в Казахстане
    currency:   'KZT',
    // cost — закупка у Matkasym по экспортной цене, поэтому в долларах
    priceTypes: ['retail', 'wholesale', 'cost'],
    headerCell: 'товар',
    trimUnit:   false,
    warehouses: [/^основной склад/i],
  },
};

// Валюта конкретной цены: экспортный прайс всегда в долларах,
// закупка Matkasym KZ — тоже (он покупает у Matkasym по экспортной цене).
function currencyOf(baseKey, priceType) {
  if (PRICE_TYPES[priceType]?.currency) return PRICE_TYPES[priceType].currency;
  if (baseKey === 'qtop' && priceType === 'cost') return 'USD';
  return BASES[baseKey]?.currency || 'KGS';
}
const CURRENCY_SIGN = { KGS: 'сом', KZT: '₸', USD: '$' };

const BASE_KEYS = Object.keys(BASES);

// Страны учёта. Остатки разных стран не складываются: Q-top — это отдельный
// казахстанский склад, он живёт в своём каталоге (переключатель KZ в «Каталоге по сетам»).
const COUNTRIES = {
  KG: { key: 'KG', label: 'Кыргызстан', flag: '🇰🇬' },
  KZ: { key: 'KZ', label: 'Казахстан',  flag: '🇰🇿' },
};
const basesOfCountry = country => BASE_KEYS.filter(k => BASES[k].country === country);

// Product.stock — «сколько есть в Кыргызстане»: по нему работают наличие,
// корзина и буферные алерты. Казахстан в него не входит.
const STOCK_SUM_BASES = basesOfCountry('KG');
const isBaseKey = k => Object.prototype.hasOwnProperty.call(BASES, k);

// «Гладильная доска SANIRA (M), шт» → «Гладильная доска SANIRA (M)»
const stripUnit = name => name.replace(/,\s*[^,]*$/, '').trim();

// Есть ли единица измерения после последней запятой.
// В выгрузке Matkasym это надёжный признак товара: у строк-групп
// («01 TAZA KIYM,», «1 Готовая продукция/1640,») хвост пустой.
const hasUnit = raw => /,\s*[^\s,]+\s*$/.test(raw);

// Группы-разделы, которые в выгрузках встречаются как обычные строки:
// названия брендов и товарных категорий верхнего уровня.
const GENERIC_GROUPS = new Set([
  'товары', 'товары для дома', 'товары для перепродажи', 'готовая продукция',
  'маткасым хоум', 'маткасым шаар', 'мейкин',
  'вешалки', 'мангалы', 'антенны', 'сушилки', 'корзины', 'щиты', 'кронштейны',
  'обувные полки', 'гладильные доски', 'полки',
]);

/**
 * Похожа ли строка на группу номенклатуры, а не на товар.
 * Выгрузки иерархические, но ни уровней группировки, ни отступов, ни заливки,
 * по которым это можно было бы определить точно, 1С в файл не кладёт — поэтому эвристика.
 * Решение всё равно за человеком: список идёт на подтверждение, это лишь галочка по умолчанию.
 *
 * knownGroups — нормализованные имена сетов/брендов из базы сайта: в выгрузке Q-top
 * разделы называются ровно как сеты («KOSH KELINIZ», «TAZA KIYM»).
 */
function looksLikeGroup(raw, baseKey, knownGroups) {
  const s = String(raw || '').trim();
  if (!s) return true;
  if (/^итого$/i.test(s)) return true;
  if (/^\d+[\s.,]/.test(s)) return true;            // «01 TAZA KIYM», «13 Electro box»
  if (/\/\s*\d{3,4}\s*,?\s*$/.test(s)) return true; // «товары/1610», «1 Готовая продукция/1640»

  const norm = stripUnit(s).toLowerCase().replace(/\s+/g, ' ').trim();
  if (GENERIC_GROUPS.has(norm)) return true;
  if (knownGroups && knownGroups.has(norm)) return true;

  // Matkasym: товар всегда с единицей измерения, группа — без
  if (BASES[baseKey]?.trimUnit && !hasUnit(s)) return true;
  return false;
}

const toNum = v => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

/**
 * Колонки складов выгрузки: шапка (headerCell) задаёт группы, следующая строка — их поля.
 * Возвращает { dataStart, stockCols, minCols } — только для складов из base.warehouses.
 */
function detectColumns(rows, base) {
  let headRow = -1;
  for (let ri = 0; ri <= 12; ri++) {
    if (String((rows[ri] || [])[0] || '').trim().toLowerCase() === base.headerCell) { headRow = ri; break; }
  }
  if (headRow < 0) return null;

  const groups = [];
  (rows[headRow] || []).forEach((cell, col) => {
    const name = String(cell || '').trim();
    if (name && col !== 0) groups.push({ col, name });
  });

  const wanted = groups.filter(g => base.warehouses.some(re => re.test(g.name)));
  if (!wanted.length) return null;

  const sub = rows[headRow + 1] || [];
  const stockCols = [], minCols = [];
  for (const g of wanted) {
    const next = groups.find(x => x.col > g.col);
    const end  = next ? next.col : sub.length;
    for (let c = g.col; c < end; c++) {
      const t = String(sub[c] || '').trim().toLowerCase();
      if (t === 'остаток')             stockCols.push(c);
      else if (t === 'минимальный остаток') minCols.push(c);
    }
  }
  if (!stockCols.length) return null;

  return { headRow, dataStart: headRow + 2, stockCols, minCols, warehouses: wanted.map(g => g.name) };
}

/**
 * Разбирает выгрузку остатков базы matkasym / qtop.
 * → { stockMap: Map<normName, {stock, buffer}>, warehouses, rowsRead }
 * Отрицательные остатки режем в 0: на складе не может лежать минус.
 */
function parseStockRows(rows, baseKey, normName) {
  const base = BASES[baseKey];
  if (!base || base.legacyParser) throw new Error(`Базу «${baseKey}» разбирает legacy-парсер`);

  const cols = detectColumns(rows, base);
  if (!cols) {
    throw new Error(
      `Не найдены склады базы «${base.label}» — проверь, что выгружен нужный отчёт ` +
      `(ждём шапку «${base.headerCell}» и склад ${base.warehouses.map(String).join(', ')})`
    );
  }

  const stockMap = new Map();
  let rowsRead = 0;
  for (let i = cols.dataStart; i < rows.length; i++) {
    const row = rows[i] || [];
    const raw = String(row[0] || '').trim();
    if (!raw) continue;

    const name = base.trimUnit ? stripUnit(raw) : raw;
    if (!name) continue;

    const stock  = Math.max(0, Math.floor(cols.stockCols.reduce((n, c) => n + toNum(row[c]), 0)));
    // Буфер 1С ведёт по каждому складу отдельно — берём больший, 0 = не задан
    const buffer = cols.minCols.reduce((n, c) => Math.max(n, Math.floor(toNum(row[c]))), 0);

    // raw нужен как есть: признак «товар/группа» у Matkasym читается по единице
    // измерения, а в name она уже отрезана
    stockMap.set(normName(name), { stock, buffer, name, raw });
    rowsRead++;
  }

  return { stockMap, warehouses: cols.warehouses, rowsRead };
}

/**
 * Разбирает выгрузку прайса: ищет шапку (колонка с номенклатурой) и колонку нужного
 * типа цены по её названию из 1С. Формат прайсов у баз отличается, поэтому колонки
 * не зашиты, а ищутся — как и у остатков.
 * → { priceMap: Map<normName, number>, nameCol, priceCol, headRow }
 */
function parsePriceRows(rows, priceType, normName) {
  const type = PRICE_TYPES[priceType];
  if (!type) throw new Error(`Неизвестный тип цены: ${priceType}`);

  let headRow = -1, nameCol = -1, priceCol = -1;
  for (let ri = 0; ri < Math.min(rows.length, 15); ri++) {
    const row = rows[ri] || [];
    let nc = -1, pc = -1;
    row.forEach((cell, c) => {
      const t = String(cell || '').trim();
      if (!t) return;
      if (nc < 0 && /^(номенклатура|товар|наименование)/i.test(t)) nc = c;
      if (pc < 0 && type.c1Pattern.test(t)) pc = c;
    });
    if (nc >= 0 && pc >= 0) { headRow = ri; nameCol = nc; priceCol = pc; break; }
  }
  if (headRow < 0) {
    throw new Error(
      `В файле не найдена колонка «${type.label}». Нужна выгрузка, где есть столбец ` +
      `с номенклатурой и столбец этого типа цены.`
    );
  }

  const priceMap = new Map();
  for (let i = headRow + 1; i < rows.length; i++) {
    const row  = rows[i] || [];
    const name = String(row[nameCol] || '').trim();
    if (!name) continue;
    const price = Number(String(row[priceCol] ?? '').toString().replace(/\s/g, '').replace(',', '.'));
    if (!price || isNaN(price) || price <= 0) continue;
    priceMap.set(normName(stripUnit(name)), Math.round(price * 100) / 100);
  }
  return { priceMap, nameCol, priceCol, headRow };
}

module.exports = {
  BASES, BASE_KEYS, isBaseKey, parseStockRows, parsePriceRows, stripUnit, looksLikeGroup,
  COUNTRIES, basesOfCountry, STOCK_SUM_BASES,
  PRICE_TYPES, PRICE_TYPE_KEYS, isPriceType, currencyOf, CURRENCY_SIGN,
};
