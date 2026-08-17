/**
 * Загрузка остатков из выгрузки 1С — общий код для всех входов.
 *
 * Входов два и они должны вести себя одинаково: кнопка «Остатки» в админке
 * и файл, отправленный боту в Telegram. Логика тут нетривиальная (связь по
 * артикулу, комплекты, буферные алерты, «пропал из выгрузки»), второй копии
 * у неё быть не должно.
 */
const xlsx = require('xlsx');

const Product  = require('../models/Product');
const StockLog = require('../models/StockLog');
const { uploadRawBuffer } = require('./cloudinary');
const { sendBufferStockAlerts } = require('./telegram');
const { zoneOf } = require('./bufferZones');
const {
  BASES, BASE_KEYS, isBaseKey, parseStockRows, looksLikeGroup, detectColumns, findSkuColumn,
  STOCK_SUM_BASES, normName, normSku, normNameLoose, toInt, crossedBuffer,
} = require('./stockBases');

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
  return hit.length === 1 ? hit[0] : '';
}

// Буферный запас товара: 1С ведёт минимум по каждому складу отдельно —
// берём больший, меньший игнорируем. 0 означает "в 1С не задан".
const bufferFromMins = (a, b) => Math.max(toInt(a), toInt(b));

/**
 * Разбирает файл выгрузки и записывает остатки базы baseKey.
 * Один товар лежит в нескольких базах 1С, поэтому загрузка правит только свой ключ
 * stockByBase[base], а stock пересчитывается как сумма по базам. Базы друг друга не обнуляют.
 *
 * @param {Buffer} buffer  — xlsx как есть
 * @param {string} baseKey — makein | matkasym | qtop
 * @param {object} user    — кто загрузил (для журнала остатков)
 * @returns отчёт: сколько совпало, обнулилось, какие позиции 1С не найдены в каталоге
 */
async function applyStockUpload(buffer, baseKey, user) {
  if (!isBaseKey(baseKey)) throw new Error(`Неизвестная база 1С: ${baseKey}`);

  const wb   = xlsx.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Make-in разбираем прежним парсером — формат его выгрузки не менялся
  let stockMap, warehouses = [], looseMap = new Map(), skuMap = new Map(), hasSku = false;
  if (BASES[baseKey].legacyParser) {
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

  const products = await Product.find({}, '_id fullName name sku skuByBase category price priceWholesale stock stockByBase inBase bufferStock brand supplier.company isKit kitType kitParts');

  // Товар из выгрузки ищем по артикулу, а не по названию: в разных базах 1С одну
  // и ту же позицию пишут по-разному («Эко мангал R10» / «Эко мангал R 10»), и остаток
  // уезжал на карточку-дубликат. Имя остаётся запасным вариантом — по нему связь
  // и устанавливается в первый раз, пока артикул у товара ещё не записан.
  let bySku = 0, byName = 0, byLoose = 0, skuLearned = 0;
  const findRow = p => {
    if (hasSku) {
      const own = normSku(p.skuByBase?.[baseKey]);
      if (own) { const r = skuMap.get(own); if (r) { bySku++; return r; } }
      const common = normSku(p.sku);
      if (common) { const r = skuMap.get(common); if (r) { bySku++; return r; } }
    }
    const nm = p.fullName || p.name || '';
    const exact = stockMap.get(normName(nm));
    if (exact) { byName++; return exact; }
    const loose = looseMap.get(normNameLoose(nm));
    if (loose) { byLoose++; return loose; }
    return undefined;
  };
  let matched = 0, zeroed = 0, buffersUpdated = 0;
  const notFoundRows = [];
  const stockLogDocs = [];
  const bufferAlerts = [];
  const changedBy = user ? { id: user._id, name: user.name, email: user.email } : {};

  // Комплекты собираются из деталей и собственной номенклатуры в 1С не имеют:
  // в общем проходе каждый выглядел бы как «пропал из выгрузки» и обнулялся.
  // Их остаток считается по деталям ниже, после записи остатков.
  const kitProducts = products.filter(p => p.isKit);
  const ops = products.filter(p => !p.isKit).map(p => {
    const row = findRow(p);

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
    // Буфер берём только из Make-in: у Matkasym свои минимумы по цехам, они бы затирали общий.
    const oldBuffer = p.bufferStock || 0;
    const newBuffer = (baseKey === 'makein' && row && row.buffer > 0) ? row.buffer : oldBuffer;
    if (newBuffer !== oldBuffer) buffersUpdated++;

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
    return { updateOne: { filter: { _id: p._id }, update: { $set: {
      stock: newStock, inStock, stockStatus: inStock ? 'in_stock' : 'out_of_stock',
      bufferStock: newBuffer,
      [`stockByBase.${baseKey}`]: byBase[baseKey],
      [`inBase.${baseKey}`]:      !!row,
      [`skuByBase.${baseKey}`]:   skuBase[baseKey],
    } } } };
  });
  if (ops.length) await Product.bulkWrite(ops, { ordered: false });

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
  for (const p of products) {
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

  const newItems = [];
  for (const [key, row] of stockMap) {
    if (known.has(key) || !row.stock) continue;
    if (knownLoose.has(normNameLoose(row.name || key))) continue;
    if (row.sku && knownSku.has(normSku(row.sku))) continue;
    const rawName = row.name || key;
    newItems.push({
      name:    rawName,
      stock:   row.stock,
      buffer:  row.buffer || 0,
      isGroup: looksLikeGroup(row.raw || rawName, baseKey, knownGroups),
    });
  }
  newItems.sort((a, b) => b.stock - a.stock);

  console.log(`[upload-stock] ${new Date().toISOString()} base=${baseKey} rows=${stockMap.size} matched=${matched} (sku=${bySku} name=${byName} loose=${byLoose}) skuLearned=${skuLearned} zeroed=${zeroed} buffers=${buffersUpdated} kits=${kitsUpdated} new=${newItems.length} warehouses=${warehouses.join(' + ') || 'legacy'}`);

  return {
    success: true, base: baseKey, baseLabel: BASES[baseKey].label, warehouses,
    matched, zeroed, total: matched + zeroed, buffersUpdated, kitsUpdated, excelBase64,
    newItems,
    // Как именно сошлись товары — видно, работает ли связь по артикулу
    matchedBy: { sku: bySku, name: byName, looseName: byLoose },
    hasSkuColumn: hasSku, skuLearned,
  };
}

// То же по файлу целиком — для входов, где базу никто не выбирал руками
function detectBaseFromBuffer(buffer) {
  const wb   = xlsx.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  return detectBase(xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }));
}

module.exports = { applyStockUpload, detectBase, detectBaseFromBuffer, detectStockColumns };
