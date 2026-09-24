/**
 * Загрузка остатков из выгрузки 1С — общий код для всех входов.
 *
 * Входов два и они должны вести себя одинаково: кнопка «Остатки» в админке
 * и файл, отправленный боту в Telegram. Логика тут нетривиальная (связь по
 * артикулу, комплекты, буферные алерты, «пропал из выгрузки»), второй копии
 * у неё быть не должно.
 */
const xlsx = require('xlsx');

const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';

const Product  = require('../models/Product');
const StockLog = require('../models/StockLog');
const { uploadRawBuffer } = require('./cloudinary');
const { sendBufferStockAlerts, sendTelegramMessage } = require('./telegram');
const { zoneOf } = require('./bufferZones');
const {
  BASES, BASE_KEYS, isBaseKey, parseStockRows, parseTurnoverRows, looksLikeGroup, detectColumns, findSkuColumn,
  STOCK_SUM_BASES, normName, normSku, normNameLoose, toInt, crossedBuffer, PRICE_TYPES,
} = require('./stockBases');
const { keyOfName } = require('./tubes');

// ── Make-in: старый формат выгрузки ─────────────────────────────────────────
// Шапка ищется по строке, где в колонке A стоит «Товар»:
//   строка N   — склады:     "Товар" | "1 Основной склад" | "Коммерческий склад" | "Итого"
//   строка N+1 — показатели: "Остаток" | "Минимальный остаток" | "Сумма" | …
// Показатель относится к ближайшему складу слева. Склады кроме основного и
// коммерческого (Итого, Виртуальный, Вен агент) игнорируются.
// В старых выгрузках колонок минимума нет — тогда minOsn/minKomm остаются null.
function detectStockColumns(rows) {
  const fallback = { colOsn: 4, colKomm: 19, minOsn: null, minKomm: null, dataStart: 7, skuCol: -1 };

  let headRow = -1;
  for (let ri = 0; ri <= 12; ri++) {
    if (String((rows[ri] || [])[0] || '').trim().toLowerCase() === 'товар') { headRow = ri; break; }
  }
  if (headRow < 0) return fallback;

  const groups = [];
  (rows[headRow] || []).forEach((cell, c) => {
    const t = String(cell || '').trim().toLowerCase();
    if (!t || c === 0) return;
    groups.push({ col: c, key: t.includes('основной') ? 'Osn' : t.includes('коммерческий') ? 'Komm' : null });
  });
  if (!groups.some(g => g.key)) return fallback;

  const out = {
    colOsn: null, colKomm: null, minOsn: null, minKomm: null, dataStart: headRow + 2,
    // Артикул: в Make-in его выводят в отчёт не всегда, поэтому колонка необязательна
    skuCol: findSkuColumn([rows[headRow] || [], rows[headRow + 1] || []]),
  };
  (rows[headRow + 1] || []).forEach((cell, c) => {
    const t = String(cell || '').trim().toLowerCase();
    if (!t.includes('остаток')) return;
    const g = groups.filter(x => x.col <= c).pop();
    if (!g || !g.key) return;
    const field = (t.includes('минимальн') ? 'min' : 'col') + g.key;
    if (out[field] === null) out[field] = c;
  });
  if (out.colOsn === null && out.colKomm === null) return fallback;
  if (out.colOsn === null)  out.colOsn  = fallback.colOsn;
  if (out.colKomm === null) out.colKomm = fallback.colKomm;
  return out;
}

// Есть ли в файле разметка склада Make-in. Отдельно от detectStockColumns:
// тот при неудаче возвращает fallback-колонки и никогда не говорит «не моё».
function looksLikeMakein(rows) {
  for (let ri = 0; ri <= 12; ri++) {
    const row = rows[ri] || [];
    if (String(row[0] || '').trim().toLowerCase() !== 'товар') continue;
    return row.some(c => String(c || '').toLowerCase().includes('коммерческий'));
  }
  return false;
}

// Похоже ли на оборотную ведомость по ТМЗ (отчёт склада трубопроката):
// в шапке «Наименование» и группа «Сальдо на конец периода».
function looksLikeTurnover(rows) {
  for (let ri = 0; ri < Math.min(rows.length, 20); ri++) {
    const row = rows[ri] || [];
    if (String(row[0] || '').trim().toLowerCase() !== 'наименование') continue;
    return row.some(c => /сальдо\s+на\s+конец/i.test(String(c || '')));
  }
  return false;
}

/**
 * Какой базе принадлежит выгрузка. Нужно там, где базу не выбирают руками
 * (файл, присланный боту): у каждой базы своя шапка и свои склады.
 *
 * Подошла ровно одна — берём её. Ни одной или сразу несколько — возвращаем ''
 * и спрашиваем человека: загрузка не в ту базу обнуляет остатки всего каталога,
 * а угадывание тут стоит дороже лишнего вопроса.
 */
function detectBase(rows) {
  const hit = [];
  if (detectColumns(rows, BASES.matkasym)) hit.push('matkasym');
  if (looksLikeMakein(rows))               hit.push('makein');
  if (detectColumns(rows, BASES.qtop))     hit.push('qtop');
  if (looksLikeTurnover(rows))             hit.push('tubes');
  return hit.length === 1 ? hit[0] : '';
}

// Буферный запас товара: 1С ведёт минимум по каждому складу отдельно —
// берём больший, меньший игнорируем. 0 означает "в 1С не задан".
const bufferFromMins = (a, b) => Math.max(toInt(a), toInt(b));

// ── Догадка «позицию переименовали» ─────────────────────────────────────────
// Сравниваем имена по словам, а не по буквам: в 1С обычно правят одно слово
// («Стол Асыл» → «Стол Асыл дуб»), и посимвольное расстояние на таком хвосте
// врёт. Односимвольные куски выбрасываем, кириллические двойники латиницы
// сводит normNameLoose — в номенклатуре они намешаны внутри одного слова.
const nameTokens = (s) => [...new Set(
  String(s || '').toLowerCase().split(/[^0-9a-zа-яё]+/i)
    .map(t => normNameLoose(t)).filter(t => t.length > 1)
)];

// Доля общих слов от более длинного имени. Порога два: обычно хватает 0.6,
// но у коротких имён («Труба 25») одно общее слово — это половина названия,
// и такому совпадению верить нельзя.
const SIMILAR_MIN = 0.6;
const SIMILAR_MIN_SHORT = 0.85;

function scoreTokens(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const common = a.filter(t => setB.has(t)).length;
  if (!common) return 0;
  const score = common / Math.max(a.length, b.length);
  const need = common >= 2 ? SIMILAR_MIN : SIMILAR_MIN_SHORT;
  return score >= need ? score : 0;
}

/**
 * Пары «товар пропал из выгрузки» ↔ «строка выгрузки никому не досталась».
 * Ничего не применяем автоматически: ошибка увела бы остаток на чужую карточку.
 * Возвращаем только догадки, человек решает сам.
 *
 * Перебор идёт не всех со всеми: строим индекс по словам и считаем схожесть
 * лишь с теми строками, где есть хотя бы одно общее слово.
 */
function guessRenames(missing, freeRows, baseKey) {
  if (!missing.length || !freeRows.length) return [];

  const rowTokens = freeRows.map(r => nameTokens(r.name || r.raw || ''));
  const byToken = new Map();
  rowTokens.forEach((tokens, i) => {
    for (const t of tokens) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(i);
    }
  });

  const pairs = [];
  for (const p of missing) {
    const tokens = nameTokens(p.fullName || p.name || '');
    const candidates = new Set();
    for (const t of tokens) for (const i of byToken.get(t) || []) candidates.add(i);
    for (const i of candidates) {
      const score = scoreTokens(tokens, rowTokens[i]);
      if (score) pairs.push({ score, p, i });
    }
  }

  // Лучшие пары первыми, и каждый товар и каждая строка участвуют один раз:
  // иначе одна новая строка «переименовалась» бы сразу из трёх карточек.
  pairs.sort((a, b) => b.score - a.score);
  const usedP = new Set(), usedI = new Set();
  const out = [];
  for (const { score, p, i } of pairs) {
    const pid = String(p._id);
    if (usedP.has(pid) || usedI.has(i)) continue;
    usedP.add(pid); usedI.add(i);
    const row = freeRows[i];
    out.push({
      id:    pid,
      card:  p.fullName || p.name || '',
      sku:   p.skuByBase?.[baseKey] || p.sku || '',
      was:   p.nameByBase?.[baseKey] || p.fullName || p.name || '',
      now:   String(row.name || row.raw || '').trim(),
      stock: row.stock,
      score: Math.round(score * 100),
    });
  }
  return out;
}

// Короткое сообщение владельцам: в 1С сменили название номенклатуры.
// Список режем — в отчёте загрузки видно всё, а в Telegram важен сам факт.
async function notifyRenames(baseKey, renamed, suspects) {
  const User = require('../models/User');
  const owners = await User.find({ role: 'owner', telegramChatId: { $nin: [null, ''] } }, 'telegramChatId').lean();
  if (!owners.length) return;

  const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = [`<b>✏️ В базе «${BASES[baseKey].label}» переименовали номенклатуру</b>`];

  if (renamed.length) {
    lines.push('', `Точно (товар нашёлся по артикулу): <b>${renamed.length}</b>`);
    for (const r of renamed.slice(0, 5)) lines.push(`• ${esc(r.was)}\n   → ${esc(r.now)}`);
    if (renamed.length > 5) lines.push(`…и ещё ${renamed.length - 5}`);
  }
  if (suspects.length) {
    lines.push('', `Похоже на переименование — остаток обнулился: <b>${suspects.length}</b>`);
    for (const r of suspects.slice(0, 5)) lines.push(`• ${esc(r.was)}\n   → ${esc(r.now)} (${r.stock} шт., совпадение ${r.score}%)`);
    if (suspects.length > 5) lines.push(`…и ещё ${suspects.length - 5}`);
  }
  lines.push('', `<a href="${SITE_URL}/admin">Открыть матрицу →</a>`);

  for (const o of owners) await sendTelegramMessage(o.telegramChatId, lines.join('\n'), { disablePreview: true });
}

/**
 * Разбирает файл выгрузки и записывает остатки базы baseKey.
 * Один товар лежит в нескольких базах 1С, поэтому загрузка правит только свой ключ
 * stockByBase[base], а stock пересчитывается как сумма по базам. Базы друг друга не обнуляют.
 *
 * @param {Buffer} buffer  — xlsx как есть
 * @param {string} baseKey — makein | matkasym | qtop
 * @param {object} user    — кто загрузил (для журнала остатков)
 * @param {object} opts    — { notifyTelegram } слать ли владельцам письмо о переименованиях
 * @returns отчёт: сколько совпало, обнулилось, какие позиции 1С не найдены в каталоге
 */
async function applyStockUpload(buffer, baseKey, user, opts = {}) {
  if (!isBaseKey(baseKey)) throw new Error(`Неизвестная база 1С: ${baseKey}`);

  const wb   = xlsx.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Make-in разбираем прежним парсером — формат его выгрузки не менялся
  let stockMap, warehouses = [], looseMap = new Map(), skuMap = new Map(), hasSku = false;
  // Трубы связываются по геометрии («Круглая|25|0.9»), а не по имени: в 1С они
  // называются «ПФ Труба Ф25*0,9мм», в каталоге — «Труба круглая 25×0,9».
  const tubeMap = new Map();
  if (BASES[baseKey].report === 'turnover') {
    ({ stockMap } = parseTurnoverRows(rows, normName));
    warehouses = ['Склад трубопроката'];
    for (const row of stockMap.values()) {
      const key = keyOfName(row.name);
      if (key && !tubeMap.has(key)) tubeMap.set(key, row);
      if (!looseMap.has(normNameLoose(row.name))) looseMap.set(normNameLoose(row.name), row);
    }
  } else if (BASES[baseKey].legacyParser) {
    const { colOsn, colKomm, minOsn, minKomm, dataStart, skuCol } = detectStockColumns(rows);
    const hasBufferCols = minOsn !== null || minKomm !== null;
    hasSku = skuCol >= 0;
    stockMap = new Map();
    for (let i = dataStart; i < rows.length; i++) {
      const row  = rows[i];
      const name = String(row[0] || '').trim();
      if (!name) continue;

      const osnNum  = toInt(row[colOsn]);
      const kommRaw = Number(row[colKomm]);
      const kommNum = (!isNaN(kommRaw) && Number.isInteger(kommRaw)) ? Math.max(0, kommRaw) : 0;
      const buffer  = hasBufferCols ? bufferFromMins(minOsn === null ? 0 : row[minOsn], minKomm === null ? 0 : row[minKomm]) : 0;
      const sku     = hasSku ? String(row[skuCol] || '').trim() : '';
      const entry = { stock: osnNum + kommNum, buffer, name, raw: name, sku };
      stockMap.set(normName(name), entry);
      if (!looseMap.has(normNameLoose(name))) looseMap.set(normNameLoose(name), entry);
      // Артикул в Make-in теперь тоже общий (MKS-ДУ0014-GRY по номеру чертежа):
      // по нему остаток попадает на ту же карточку, что и остатки Matkasym и Q-top,
      // как бы номенклатуру ни переименовали в самой базе.
      if (sku && !skuMap.has(normSku(sku))) skuMap.set(normSku(sku), entry);
    }
  } else {
    ({ stockMap, looseMap, skuMap, hasSku, warehouses } = parseStockRows(rows, baseKey, normName));
  }

  // База труб обслуживает только свой сет: остальной каталог она не видит и,
  // главное, не обнуляет — иначе один файл на 20 строк прошёлся бы по всем 1442.
  const scope = BASES[baseKey].set ? { set: BASES[baseKey].set } : {};
  const products = await Product.find(scope, '_id fullName name sku skuByBase nameByBase category price priceWholesale priceCost stock stockByBase inBase bufferStock bufferByBase brand supplier.company isKit kitType kitParts');

  // Товар из выгрузки ищем по артикулу, а не по названию: в разных базах 1С одну
  // и ту же позицию пишут по-разному («Эко мангал R10» / «Эко мангал R 10»), и остаток
  // уезжал на карточку-дубликат. Имя остаётся запасным вариантом — по нему связь
  // и устанавливается в первый раз, пока артикул у товара ещё не записан.
  let bySku = 0, byName = 0, byLoose = 0, skuLearned = 0;
  let byTube = 0, byPrevName = 0;
  // Строки выгрузки, уже отданные какому-то товару: по остальным ниже ищем,
  // не переименовали ли в 1С позицию, которая «пропала» из файла.
  const usedRows = new Set();
  const findRow = p => {
    const take = (row, how, bump) => { bump(); usedRows.add(row); return { row, how }; };

    if (tubeMap.size) {
      const key = keyOfName(p.fullName || p.name || '');
      const r = key && tubeMap.get(key);
      if (r) return take(r, 'tube', () => byTube++);
    }
    if (hasSku) {
      const own = normSku(p.skuByBase?.[baseKey]);
      if (own) { const r = skuMap.get(own); if (r) return take(r, 'sku', () => bySku++); }
      const common = normSku(p.sku);
      if (common) { const r = skuMap.get(common); if (r) return take(r, 'sku', () => bySku++); }
    }
    const nm = p.fullName || p.name || '';
    const exact = stockMap.get(normName(nm));
    if (exact) return take(exact, 'name', () => byName++);

    // Имя из прошлой выгрузки. Спасает обратный случай: карточку переименовали
    // у нас, а в 1С осталось прежнее название — по fullName она уже не находится.
    const prev = p.nameByBase?.[baseKey] || '';
    if (prev) {
      const r = stockMap.get(normName(prev)) || looseMap.get(normNameLoose(prev));
      if (r) return take(r, 'prevName', () => byPrevName++);
    }

    const loose = looseMap.get(normNameLoose(nm));
    if (loose) return take(loose, 'looseName', () => byLoose++);
    return { row: undefined, how: '' };
  };
  let matched = 0, zeroed = 0, buffersUpdated = 0, pricesUpdated = 0;
  // Номенклатуру в 1С переименовывают на ходу. Связь по артикулу это переживает,
  // но знать о расхождении нужно: имя на сайте остаётся прежним, и на витрине,
  // в подписях к постам и в выгрузках товар живёт под старым названием.
  const renamed = [];
  // Товары, пропавшие из выгрузки, — кандидаты на переименование без артикула.
  const missing = [];
  const notFoundRows = [];
  const stockLogDocs = [];
  const bufferAlerts = [];
  const changedBy = user ? { id: user._id, name: user.name, email: user.email } : {};

  // Комплекты собираются из деталей и собственной номенклатуры в 1С не имеют:
  // в общем проходе каждый выглядел бы как «пропал из выгрузки» и обнулялся.
  // Их остаток считается по деталям ниже, после записи остатков.
  const kitProducts = products.filter(p => p.isKit);
  const ops = products.filter(p => !p.isKit).map(p => {
    const { row, how } = findRow(p);
    // Имя берём очищенное парсером, а не raw: в raw у Matkasym висит единица
    // измерения («…, шт»), и она и сравнение ломает, и в ключи stockMap не входит —
    // по такому имени товар потом не нашёлся бы по прежнему названию.
    const rowName  = row ? String(row.name || row.raw || '').trim() : '';
    const prevName = p.nameByBase?.[baseKey] || '';

    // Имя из выгрузки помним всегда — по нему в следующий раз видно, что изменилось.
    // Первая выгрузка после обновления поля прежнего имени не знает: расхождение
    // с fullName карточки там ни о чём не говорит (в базах пишут по-своему),
    // поэтому за переименование считаем только смену имени МЕЖДУ выгрузками.
    if (row && prevName && normName(prevName) !== normName(rowName)) {
      renamed.push({
        id:   String(p._id),
        card: p.fullName || p.name || '',
        sku:  p.skuByBase?.[baseKey] || p.sku || '',
        was:  prevName,
        now:  rowName,
        how,
      });
    }

    // Артикул базы запоминаем при первом же совпадении — дальше связь держится
    // на нём, и переименование номенклатуры в 1С её больше не рвёт.
    const skuBase = { makein: '', matkasym: '', qtop: '', ...(p.skuByBase ? (p.skuByBase.toObject?.() || p.skuByBase) : {}) };
    if (row?.sku && !skuBase[baseKey]) { skuBase[baseKey] = row.sku; skuLearned++; }

    // Правим только остаток этой базы, остальные оставляем как есть
    const byBase = { makein: 0, matkasym: 0, qtop: 0, ...(p.stockByBase ? p.stockByBase.toObject() : {}) };
    const oldBaseStock = byBase[baseKey] || 0;
    byBase[baseKey] = row ? row.stock : 0;

    // stock — наличие в Кыргызстане (makein + matkasym). Q-top это Казахстан:
    // отдельная страна и отдельный учёт, складывать их в одно число нельзя.
    const newStock = STOCK_SUM_BASES.reduce((n, k) => n + (byBase[k] || 0), 0);
    const inStock  = newStock > 0;
    const oldStock = p.stock || 0;

    if (row) {
      matched++;
    } else {
      // Товар знали в этой базе, а в файле его нет — либо сняли с номенклатуры,
      // либо переименовали. Второе проверяем ниже по свободным строкам выгрузки.
      if (p.inBase?.[baseKey] || oldBaseStock > 0) missing.push(p);
      // «Пропал из выгрузки» — только если в этой базе остаток был.
      // Для Make-in сохраняем прежнее поведение: список всего, чего нет в файле.
      if (baseKey === 'makein' || oldBaseStock > 0) {
        zeroed++;
        notFoundRows.push({
          'Название':    p.fullName || p.name || '',
          'Артикул':     p.sku || '',
          'Категория':   p.category || '',
          'Цена розн.':  p.price || 0,
          'Цена опт.':   p.priceWholesale || 0,
        });
      }
    }

    // Буфер из 1С перезаписывает ручной, но только если задан.
    // У товаров IKEA в 1С минимума нет — там буфер ведут вручную, его не затираем.
    // Пишем в свою базу: у Make-in и Matkasym минимумы свои, раньше вторые отбрасывались.
    const bufByBase = { makein: 0, matkasym: 0, qtop: 0,
      ...(p.bufferByBase ? (p.bufferByBase.toObject?.() || p.bufferByBase) : {}) };
    const oldBaseBuffer = bufByBase[baseKey] || 0;
    if (row && row.buffer > 0) bufByBase[baseKey] = row.buffer;
    if (bufByBase[baseKey] !== oldBaseBuffer) buffersUpdated++;

    // Общий буфер — сумма по базам Кыргызстана, как и остаток. Пока по базам пусто
    // (старые карточки, ручной буфер до разделения) — прежнее значение не трогаем.
    const oldBuffer = p.bufferStock || 0;
    const sumBuffer = STOCK_SUM_BASES.reduce((n, k) => n + (bufByBase[k] || 0), 0);
    const newBuffer = sumBuffer > 0 ? sumBuffer : oldBuffer;

    if (newStock !== oldStock) {
      stockLogDocs.push({
        productId:   p._id,
        productName: p.fullName || p.name || '',
        sku:         p.sku || '',
        delta:       newStock - oldStock,
        fromStock:   oldStock,
        toStock:     newStock,
        source:      'excel',
        base:        baseKey,
        notInFile:   !row,
        changedBy,
      });
      // Алерт только если товар реально есть в выгрузке (обнуление "не найден" — не продажа)
      if (row && crossedBuffer(oldStock, newStock, newBuffer)) {
        bufferAlerts.push({ name: p.fullName || p.name, sku: p.sku, stock: newStock, bufferStock: newBuffer, zone: zoneOf(p) });
      }
    }
    // «Цена» оборотной ведомости — средняя себестоимость метра. Ноль не пишем:
    // в ведомости он значит «за период не двигалось», а не «стало бесплатно».
    const priceSet = {};
    const priceField = BASES[baseKey].priceField;
    if (row && priceField && row.price > 0) {
      priceSet[`pricesByBase.${baseKey}.${priceField}`] = row.price;
      const legacy = PRICE_TYPES[priceField]?.legacyField;
      if (legacy && BASES[baseKey].country === 'KG') priceSet[legacy] = row.price;
      pricesUpdated++;
    }
    // Единица учёта базы: остаток труб 1С ведёт в метрах, и «786 шт» на карточке
    // читалось бы как 786 труб вместо 131.
    if (row && BASES[baseKey].unit) priceSet.unit = BASES[baseKey].unit;
    // Имя пишем только когда товар в выгрузке есть: у пропавшего прежнее имя
    // как раз и пригодится, чтобы найти его в следующем файле.
    if (row) priceSet[`nameByBase.${baseKey}`] = rowName;

    return { updateOne: { filter: { _id: p._id }, update: { $set: {
      ...priceSet,
      stock: newStock, inStock, stockStatus: inStock ? 'in_stock' : 'out_of_stock',
      bufferStock: newBuffer,
      [`bufferByBase.${baseKey}`]: bufByBase[baseKey],
      [`stockByBase.${baseKey}`]: byBase[baseKey],
      [`inBase.${baseKey}`]:      !!row,
      [`skuByBase.${baseKey}`]:   skuBase[baseKey],
    } } } };
  });
  if (ops.length) await Product.bulkWrite(ops, { ordered: false });

  // Пропал из выгрузки — возможно, не пропал, а переименован. Строки, не доставшиеся
  // никому, сравниваем с пропавшими товарами по словам. Остаток такому товару уже
  // обнулён: связывать карточку с догадкой автоматически нельзя, поэтому просто
  // показываем пару «было → стало» — поправить имя или артикул человек решает сам.
  const freeRows = [...new Set([...stockMap.values(), ...looseMap.values()])]
    .filter(r => !usedRows.has(r) && r.stock > 0);
  const renameSuspects = guessRenames(missing, freeRows, baseKey);

  // Зависимый комплект (парта + стул) существует ровно в том количестве, на какое
  // хватает самой дефицитной детали. Читаем детали после bulkWrite — уже с новыми остатками.
  // Независимые (SKÅDIS, BOAXEL) не трогаем: их детали самостоятельны, остаток комплекта не имеет смысла.
  const depKits = kitProducts.filter(k => k.kitType !== 'independent' && k.kitParts?.length);
  let kitsUpdated = 0;
  if (depKits.length) {
    const partIds = depKits.flatMap(k => k.kitParts.map(part => part.product).filter(Boolean));
    const parts   = await Product.find({ _id: { $in: partIds } }, '_id stockByBase').lean();
    const partById = new Map(parts.map(p => [String(p._id), p]));

    const kitOps = [];
    for (const kit of depKits) {
      const usable = kit.kitParts.filter(part => part.product && partById.has(String(part.product)));
      if (usable.length !== kit.kitParts.length) continue;  // деталь потеряна — остаток не выдумываем

      // По каждой базе отдельно: детали разных складов в один комплект не собрать,
      // поэтому берём минимум внутри базы, а страну — как у обычного товара, суммой KG-баз.
      const byBase = {};
      for (const b of BASE_KEYS) {
        byBase[b] = Math.min(...usable.map(part => {
          const src = partById.get(String(part.product)).stockByBase || {};
          return Math.floor((src[b] || 0) / (part.qty || 1));
        }));
      }
      const newStock = STOCK_SUM_BASES.reduce((n, k) => n + (byBase[k] || 0), 0);
      const oldStock = kit.stock || 0;
      if (newStock === oldStock) continue;

      stockLogDocs.push({
        productId:   kit._id,
        productName: kit.fullName || kit.name || '',
        sku:         kit.sku || '',
        delta:       newStock - oldStock,
        fromStock:   oldStock,
        toStock:     newStock,
        source:      'excel',
        base:        baseKey,
        notInFile:   false,
        changedBy,
      });
      kitOps.push({ updateOne: { filter: { _id: kit._id }, update: { $set: {
        stock: newStock, inStock: newStock > 0, stockStatus: newStock > 0 ? 'in_stock' : 'out_of_stock',
        ...Object.fromEntries(BASE_KEYS.map(b => [`stockByBase.${b}`, byBase[b]])),
      } } } });
    }
    if (kitOps.length) await Product.bulkWrite(kitOps, { ordered: false });
    kitsUpdated = kitOps.length;
  }

  if (bufferAlerts.length) sendBufferStockAlerts(bufferAlerts).catch(e => console.error('[BufferAlert]', e.message));

  // Клиенты Telegram-магазина, которые просили сообщить о поступлении: ищем в логах
  // переходы 0 → есть остаток. Делаем это здесь, а не в отдельном обходе базы,
  // потому что только тут известно, каким был остаток ДО выгрузки.
  require('./shopNotify').notifyRestocked(stockLogDocs)
    .catch(e => console.error('[shopNotify]', e.message));

  // Upload Excel to Cloudinary for source link, then save logs
  let excelSourceUrl = '';
  try {
    excelSourceUrl = await uploadRawBuffer(buffer, 'matkasym/stock-uploads', `stock_${Date.now()}`);
  } catch (_) {}
  if (stockLogDocs.length) {
    const docsWithUrl = stockLogDocs.map(d => ({ ...d, sourceUrl: excelSourceUrl }));
    await StockLog.insertMany(docsWithUrl, { ordered: false });
  }

  let excelBase64 = null;
  if (notFoundRows.length > 0) {
    const wb2 = xlsx.utils.book_new();
    const ws2 = xlsx.utils.json_to_sheet(notFoundRows);
    xlsx.utils.book_append_sheet(wb2, ws2, 'Пропущенные');
    excelBase64 = xlsx.write(wb2, { type: 'base64', bookType: 'xlsx' });
  }

  // Товары, которые есть в выгрузке с остатком, но которых нет в каталоге.
  // Не создаём молча: в выгрузке кроме товаров лежат строки-группы и сырьё,
  // поэтому список идёт на подтверждение (POST /admin/confirm-stock-items).
  // Ключи те же, что у findRow: иначе карточка, найденная по артикулу или по имени
  // без пробелов, попадёт в «новые» и её заведут вторым дублем.
  const known = new Set();
  const knownLoose = new Set();
  const knownSku = new Set();
  const knownTubes = new Set();
  for (const p of products) {
    if (tubeMap.size) {
      const k = keyOfName(p.fullName || p.name || '');
      if (k) knownTubes.add(k);
    }
    known.add(normName(p.fullName || p.name || ''));
    knownLoose.add(normNameLoose(p.fullName || p.name || ''));
    if (p.name) { known.add(normName(p.name)); knownLoose.add(normNameLoose(p.name)); }
    if (p.sku) knownSku.add(normSku(p.sku));
    const bs = normSku(p.skuByBase?.[baseKey]);
    if (bs) knownSku.add(bs);
  }
  // В Q-top разделы выгрузки названы ровно как сеты сайта («KOSH KELINIZ», «TAZA KIYM») —
  // сверяем с ними, иначе такая строка выглядит как обычный товар.
  const setSlugs = await Product.distinct('set');
  const knownGroups = new Set(setSlugs.filter(Boolean).map(s => normName(String(s).replace(/-/g, ' '))));

  // Строка, похожая на переименованную позицию, тоже выглядит как «новый товар».
  // Помечаем такие, иначе их заведут вторым дублем вместо правки имени.
  const suspectByName = new Map(renameSuspects.map(r => [normName(r.now), r]));

  const newItems = [];
  for (const [key, row] of stockMap) {
    if (known.has(key) || !row.stock) continue;
    // Труба уже есть в каталоге под своим именем — «новой» её считать нельзя
    if (tubeMap.size && knownTubes.has(keyOfName(row.name || ''))) continue;
    if (knownLoose.has(normNameLoose(row.name || key))) continue;
    if (row.sku && knownSku.has(normSku(row.sku))) continue;
    const rawName = row.name || key;
    newItems.push({
      name:    rawName,
      stock:   row.stock,
      buffer:  row.buffer || 0,
      isGroup: looksLikeGroup(row.raw || rawName, baseKey, knownGroups),
      maybeRenamedFrom: suspectByName.get(normName(rawName))?.card || '',
    });
  }
  newItems.sort((a, b) => b.stock - a.stock);

  // Загрузку из админки владелец видит на экране, но переименование — вещь, о которой
  // надо узнать, даже если файл залил редактор со своего компьютера.
  if (opts.notifyTelegram && (renamed.length || renameSuspects.length)) {
    notifyRenames(baseKey, renamed, renameSuspects)
      .catch(e => console.error('[stockSync] уведомление о переименовании:', e.message));
  }

  console.log(`[upload-stock] ${new Date().toISOString()} base=${baseKey} rows=${stockMap.size} matched=${matched} (sku=${bySku} name=${byName} prev=${byPrevName} loose=${byLoose} tube=${byTube}) renamed=${renamed.length} maybeRenamed=${renameSuspects.length} prices=${pricesUpdated} skuLearned=${skuLearned} zeroed=${zeroed} buffers=${buffersUpdated} kits=${kitsUpdated} new=${newItems.length} warehouses=${warehouses.join(' + ') || 'legacy'}`);

  return {
    success: true, base: baseKey, baseLabel: BASES[baseKey].label, warehouses,
    matched, zeroed, total: matched + zeroed, buffersUpdated, kitsUpdated, excelBase64,
    newItems,
    // Как именно сошлись товары — видно, работает ли связь по артикулу
    matchedBy: { sku: bySku, name: byName, looseName: byLoose, tube: byTube, prevName: byPrevName },
    // Переименования в 1С: точные (товар нашёлся, а имя в файле другое)
    // и догадки (товар пропал, но на него похожа ничья строка выгрузки).
    renamed, renameSuspects,
    pricesUpdated, unit: BASES[baseKey].unit || 'шт',
    hasSkuColumn: hasSku, skuLearned,
  };
}

// То же по файлу целиком — для входов, где базу никто не выбирал руками
function detectBaseFromBuffer(buffer) {
  const wb   = xlsx.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  return detectBase(xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }));
}

module.exports = { applyStockUpload, detectBase, detectBaseFromBuffer, detectStockColumns, guessRenames };
