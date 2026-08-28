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

// Типы цен. Набор у баз разный: у Matkasym, например, нет закупочной цены в тенге —
// в Казахстан он отгружает по экспортному прайсу в долларах.
// legacyField — поле товара, куда цена Make-in пишется дополнительно: на неё завязан
// весь остальной сайт, и сотрудникам показывается именно она.
// c1Pattern — как тип цены называется в 1С («Типы цен номенклатуры»).
// К названию типа 1С дописывает валюту («Оптовая KGS», «Дилерская KGS»), поэтому
// матчим по началу. «Оптовая» — с оговоркой: рядом живёт «Оптовая цена с учётом НДС»,
// это другая цена, её отсекаем негативным lookahead.
const PRICE_TYPES = {
  retail:    { key: 'retail',    label: 'Розничные цены',  legacyField: 'price',          c1Pattern: /^розничная/i },
  wholesale: { key: 'wholesale', label: 'Оптовые цены',    legacyField: 'priceWholesale', c1Pattern: /^оптовая(?!.*ндс)/i },
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
    // Дилерам и оптовикам — свои прайсы, розница — для продаж со склада,
    // а в KZ Matkasym отгружает по экспортному прайсу (USD)
    priceTypes: ['retail', 'dealer', 'wholesale', 'cost', 'export'],
    headerCell: 'товар, ед.изм',
    trimUnit:   true,
    warehouses: [/склад\s+гп/i],   // «9,Склад ГП» + «11. Склад  ГП Маткасым Шаар»
    // Краски лежат не на складе готовой продукции, а в сырье — правило действует
    // только внутри своей группы 1С. Добавить склад сырья всем подряд нельзя:
    // «Кабель коаксиальный» получил бы 4556 метров комплектующих, «Щиток для
    // лица» — 7569 штук заготовок, и остаток сайта перестал бы значить товар.
    groupWarehouses: [
      { group: /краски\s+и\s+растворители/i, warehouses: [/склад\s+сырья/i] },
    ],
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

// Валюта цен конкретного товара (Product.currency) — переключается в редакторе.
// Отсюда берётся подпись везде, где показываются price/priceWholesale/priceDealer/priceCost.
const signOf = product => CURRENCY_SIGN[product?.currency] || CURRENCY_SIGN.KGS;

// «12 500 сом». Пустую цену показываем прочерком — так же, как в админке.
const fmtMoney = (value, product) => {
  const n = Number(value || 0);
  return n > 0 ? `${n.toLocaleString('ru')} ${signOf(product)}` : '—';
};

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

// Число из ячейки выгрузки. 1С печатает остаток строкой и разделяет тысячи
// запятой — «1,474». Number() на такой строке даёт NaN, и остаток молча
// становился нулём: страдали только позиции от тысячи, поэтому не бросалось
// в глаза. Дробную часть 1С пишет через точку («825.00»), так что запятая
// перед тремя цифрами — всегда разделитель разрядов, а не десятичная.
const toNum = v => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v).replace(/[\s\u00a0\u202f]/g, '');
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) s = s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{3}(?!\d)/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};

// Имя для сравнения: 1С и сайт по-разному ставят кавычки и пробелы.
const normName = (s = '') =>
  String(s).toLowerCase().replace(/[«»"""''`]/g, '').replace(/\s+/g, ' ').trim();

// Остаток из ячейки выгрузки: на складе не может лежать минус или полтора.
const toInt = v => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : Math.max(0, Math.floor(n));
};

// Остаток пересёк буферный запас сверху вниз → нужен алерт
const crossedBuffer = (oldStock, newStock, bufferStock) =>
  bufferStock > 0 && newStock < bufferStock && oldStock >= bufferStock;

// Артикул для сравнения: регистр и разделители в базах пишут по-разному
// («BBQ-R10», «bbq r10»), значимы только буквы и цифры.
const normSku = s => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]/gi, '');

// Кириллические двойники латинских букв. В номенклатуре 1С латиница и кириллица
// набраны вперемешку внутри одного слова: «Краска 9005 MAT (черная) ACРР/RALL» —
// здесь MAT латинское, а РР в ACРР кириллическое. Глазом не отличить, строки
// разные, и товар не находится. Сводим к латинице обе стороны сравнения.
const CYR_TWINS = { 'а':'a','в':'b','е':'e','к':'k','м':'m','н':'h','о':'o','р':'p','с':'c','т':'t','у':'y','х':'x' };

// Запасное сравнение имён, когда артикула в выгрузке нет: пробелы не значимы,
// иначе «Эко мангал R10» и «Эко мангал R 10» считаются разными товарами
// и остаток уезжает на дубликат.
const normNameLoose = s => String(s || '')
  .toLowerCase()
  .replace(/[«»"""''`]/g, '')
  .replace(/\s+/g, '')
  .replace(/[авекмнорстух]/g, c => CYR_TWINS[c])
  .trim();

/**
 * Колонка артикула в шапке отчёта, если её туда вывели. Ищем в обеих строках шапки:
 * 1С кладёт реквизиты номенклатуры то в верхнюю, то в нижнюю.
 *
 * «Артикул» важнее «Кода»: код у каждой базы 1С свой (у одной сушилки COMFORT он
 * 000000408 в Make-in и другой в Q-top), а артикул мы как раз и делаем общим —
 * MKS-ДУ0014-GRY по номеру чертежа. Связывать базы можно только по нему.
 * → -1, если колонки нет.
 */
function findSkuColumn(headerRows) {
  let byCode = -1;
  for (const row of headerRows) {
    for (let c = 1; c < (row || []).length; c++) {
      const t = String(row[c] || '').trim();
      // Хвост после слова отсекаем не через \b: в JS граница слова считается по
      // латинице, и «Артикул» ей не заканчивается — прежнее условие не срабатывало
      // никогда, поэтому колонку артикула не находили ни в одной выгрузке.
      if (RE_SKU_HEAD.test(t))              return c;
      if (byCode < 0 && RE_CODE_HEAD.test(t)) byCode = c;
    }
  }
  return byCode;
}
const RE_SKU_HEAD  = /^артикул(\s|$|[.,:])/i;
const RE_CODE_HEAD = /^код(\s|$|[.,:])/i;

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

  const sub = rows[headRow + 1] || [];

  // Колонки «Остаток» и «Минимальный остаток» тех складов, что подошли под набор
  // регулярок. Границей склада служит колонка следующего склада в шапке.
  const pick = (patterns) => {
    const wanted = groups.filter(g => patterns.some(re => re.test(g.name)));
    const stockCols = [], minCols = [];
    for (const g of wanted) {
      const next = groups.find(x => x.col > g.col);
      const end  = next ? next.col : sub.length;
      for (let c = g.col; c < end; c++) {
        const t = String(sub[c] || '').trim().toLowerCase();
        if (t === 'остаток')                  stockCols.push(c);
        else if (t === 'минимальный остаток') minCols.push(c);
      }
    }
    return { stockCols, minCols, warehouses: wanted.map(g => g.name) };
  };

  const main = pick(base.warehouses);
  if (!main.stockCols.length) return null;

  // Склады, которые читаются только внутри своей группы 1С (см. groupWarehouses).
  const groupCols = (base.groupWarehouses || [])
    .map(rule => ({ group: rule.group, ...pick(rule.warehouses) }))
    .filter(r => r.stockCols.length);

  const skuCol = findSkuColumn([rows[headRow] || [], sub]);

  return {
    headRow, dataStart: headRow + 2, skuCol,
    stockCols: main.stockCols, minCols: main.minCols,
    groupCols,
    warehouses: main.warehouses.concat(groupCols.flatMap(g => g.warehouses)),
  };
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

  const stockMap = new Map();   // по точному имени (как раньше)
  const looseMap = new Map();   // по имени без пробелов — запасной вариант
  const skuMap   = new Map();   // по артикулу из 1С — основной, если колонка есть
  let rowsRead = 0;
  let group = '';
  for (let i = cols.dataStart; i < rows.length; i++) {
    const row = rows[i] || [];
    const raw = String(row[0] || '').trim();
    if (!raw) continue;

    // Строка группы 1С кончается запятой («2 КРАСКИ И РАСТВОРИТЕЛИ, »), у товара
    // на этом месте единица измерения («, кг»). Запоминаем группу: от неё зависит,
    // с какого склада берётся остаток.
    if (/,\s*$/.test(raw)) { group = raw.replace(/,\s*$/, '').trim(); continue; }

    const name = base.trimUnit ? stripUnit(raw) : raw;
    if (!name) continue;

    const rule = cols.groupCols.find(g => g.group.test(group));
    const stockCols = rule ? rule.stockCols : cols.stockCols;
    const minCols   = rule ? rule.minCols   : cols.minCols;

    const stock  = Math.max(0, Math.floor(stockCols.reduce((n, c) => n + toNum(row[c]), 0)));
    // Буфер 1С ведёт по каждому складу отдельно — берём больший, 0 = не задан
    const buffer = minCols.reduce((n, c) => Math.max(n, Math.floor(toNum(row[c]))), 0);
    const sku    = cols.skuCol >= 0 ? String(row[cols.skuCol] || '').trim() : '';

    // raw нужен как есть: признак «товар/группа» у Matkasym читается по единице
    // измерения, а в name она уже отрезана
    const entry = { stock, buffer, name, raw, sku };
    stockMap.set(normName(name), entry);
    // Первая строка выигрывает: в иерархии выгрузки ниже могут идти подытоги
    if (!looseMap.has(normNameLoose(name))) looseMap.set(normNameLoose(name), entry);
    if (sku && !skuMap.has(normSku(sku)))   skuMap.set(normSku(sku), entry);
    rowsRead++;
  }

  return { stockMap, looseMap, skuMap, hasSku: cols.skuCol >= 0, warehouses: cols.warehouses, rowsRead };
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
  normSku, normNameLoose, normName, toInt, crossedBuffer, detectColumns, findSkuColumn,
  COUNTRIES, basesOfCountry, STOCK_SUM_BASES,
  PRICE_TYPES, PRICE_TYPE_KEYS, isPriceType, currencyOf, CURRENCY_SIGN, signOf, fmtMoney,
};
