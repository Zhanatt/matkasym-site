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

const BASES = {
  makein: {
    key:     'makein',
    label:   'Make-in',
    country: 'KG',
    // Разбирается старым detectStockColumns в routes/admin.js — формат не трогаем
    legacyParser: true,
  },
  matkasym: {
    key:        'matkasym',
    label:      'Matkasym',
    country:    'KG',
    headerCell: 'товар, ед.изм',
    trimUnit:   true,
    warehouses: [/склад\s+гп/i],   // «9,Склад ГП» + «11. Склад  ГП Маткасым Шаар»
  },
  qtop: {
    key:        'qtop',
    label:      'Q-top',
    country:    'KZ',              // склад, остаток и учёт — в Казахстане
    headerCell: 'товар',
    trimUnit:   false,
    warehouses: [/^основной склад/i],
  },
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

    stockMap.set(normName(name), { stock, buffer });
    rowsRead++;
  }

  return { stockMap, warehouses: cols.warehouses, rowsRead };
}

module.exports = {
  BASES, BASE_KEYS, isBaseKey, parseStockRows, stripUnit,
  COUNTRIES, basesOfCountry, STOCK_SUM_BASES,
};
