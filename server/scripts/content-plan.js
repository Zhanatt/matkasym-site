// Контент-план: сколько постов даёт каждый сет, как разложить сеты на дизайнеров
// и держится ли приоритет A/B/C при заданной норме постов в день.
//
// Задача с листа: три бренда (HOME / SHAAR / KYZMAT) → сеты → товары. Дизайнер ведёт
// свой сет, норма ~6 постов в день, а внутри дня посты берутся по приоритету:
//   A — то, что продаётся постоянно   (по умолчанию 60% постов)
//   B — то, что продаётся реже        (30%)
//   C — новинки                       (10%)
//
// Поля A/B/C в модели товара НЕТ, и заводить его тут незачем: категория — это не
// свойство товара, а срез продаж на дату. Считаем её каждый раз заново:
//   C — новинка: createdAt моложе --new-days;
//   A — из остальных: верхушка продаж за --months, набирающая --a-share процентов
//       всех проданных штук (Парето внутри бренда — см. --abc-scope);
//   B — остальные, у кого продажи есть;
//   D — «спящие»: не новинка и за период не продавались ни разу. В ротацию по
//       умолчанию не идут, иначе дизайнер тратит день на то, что никто не берёт
//       (взять их в план — флаг --include-dead).
//
// Скрипт ТОЛЬКО ЧИТАЕТ базу: ничего не пишет, --apply ему не нужен.
//
// Запуск:
//   node scripts/content-plan.js
//   node scripts/content-plan.js --per-day=7 --designers=Айпери,Бегимай,Тимур
//   node scripts/content-plan.js --mix=60/30/10 --months=6 --new-days=120
//   node scripts/content-plan.js --brand=matkasym-home --print-days=14 --json=../output/plan.json
//
// Флаги:
//   --per-day=6        норма постов на дизайнера в день
//   --designers=3      число дизайнеров или список имён через запятую
//   --mix=60/30/10     доли постов A/B/C
//   --months=6         окно продаж, по которому считаем A и B
//   --new-days=120     сколько дней товар считается новинкой (C)
//   --a-share=70       сколько процентов проданных штук набирает категория A
//   --abc-scope=brand  где сравнивать продажи: brand | set (внутри сета топ будет
//                      «липовый» — в маленьком сете в A попадёт кто угодно)
//   --unit=model       единица контента: model (варианты одного name = один пост) | sku
//   --statuses=for_sale какие productStatus берём в план (через запятую)
//   --require-photo    выкинуть из плана товары без единой картинки
//   --include-dead     подмешать «спящие» (D) в пул B
//   --days-off=0       0 — без выходных, 1 — без воскресенья, 2 — без сб и вс
//   --start=YYYY-MM-DD первый день графика (по умолчанию сегодня)
//   --print-days=7     сколько дней графика печатать в консоль
//   --json=путь        выгрузить полный план (весь график, все товары) в JSON

const fs   = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Product     = require('../models/Product');
const Brand       = require('../models/Brand');
const SalesRecord = require('../models/SalesRecord');

const MONGO_URI = require('../lib/atlas');

// ── аргументы ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit === undefined ? def : hit.slice(name.length + 3);
};
const has = name => argv.includes(`--${name}`);
const num = (name, def) => {
  const v = Number(flag(name, def));
  return Number.isFinite(v) ? v : def;
};

const PER_DAY    = Math.max(1, num('per-day', 6));
const MONTHS     = num('months', 6);
const NEW_DAYS   = num('new-days', 120);
const A_SHARE    = num('a-share', 70);
const SCOPE      = flag('abc-scope', 'brand') === 'set' ? 'set' : 'brand';
const UNIT       = flag('unit', 'model') === 'sku' ? 'sku' : 'model';
const STATUSES   = flag('statuses', 'for_sale').split(',').map(s => s.trim()).filter(Boolean);
const BRAND_ONLY = flag('brand', '');
const DAYS_OFF   = num('days-off', 0);
const PRINT_DAYS = num('print-days', 7);
const JSON_OUT   = flag('json', '');
const REQ_PHOTO  = has('require-photo');
const INC_DEAD   = has('include-dead');

const MIX = (() => {
  const parts = flag('mix', '60/30/10').split('/').map(Number);
  const [a = 60, b = 30, c = 10] = parts;
  const sum = a + b + c || 1;
  return { A: a / sum, B: b / sum, C: c / sum };
})();

const DESIGNERS = (() => {
  const raw = flag('designers', '3');
  if (/^\d+$/.test(raw)) return Array.from({ length: Number(raw) }, (_, i) => `Дизайнер ${i + 1}`);
  return raw.split(',').map(s => s.trim()).filter(Boolean);
})();

const START = (() => {
  const raw = flag('start', '');
  const d = raw ? new Date(`${raw}T00:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

const BRAND_LABEL = {
  'matkasym-home':   'HOME',
  'matkasym-shaar':  'SHAAR',
  'matkasym-kyzmat': 'KYZMAT',
};

// ── мелкие помощники ─────────────────────────────────────────────────────────
const norm = s => String(s || '').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]+/g, '');
const pad  = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const pct  = (part, whole) => whole ? `${Math.round((part / whole) * 100)}%` : '—';
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const dmy = d => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
// Локальная дата, не UTC: для UTC+6 toISOString() уводит полночь на прошлый день.
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const plural = (n, [one, few, many]) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};
const POSTS  = n => `${n} ${plural(n, ['пост', 'поста', 'постов'])}`;
const SETS   = n => `${n} ${plural(n, ['сет', 'сета', 'сетов'])}`;
const DAYS   = n => `${n} ${plural(n, ['день', 'дня', 'дней'])}`;

const isDayOff = d => (DAYS_OFF >= 1 && d.getDay() === 0) || (DAYS_OFF >= 2 && d.getDay() === 6);

// Рабочие дни начиная со START — график раскладываем только по ним.
function workdays(count) {
  const out = [];
  const d = new Date(START);
  let guard = 0;
  while (out.length < count && guard++ < count * 4 + 30) {
    if (!isDayOff(d)) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ── 1. Каталог → единицы контента ────────────────────────────────────────────
// Единица контента — это то, про что снимают ОДИН пост. По умолчанию модель:
// в админке товары группируются по name, и три цвета одной полки — не три поста.
function buildUnits(products) {
  const map = new Map();
  for (const p of products) {
    const key = UNIT === 'sku'
      ? String(p._id)
      : `${p.brand}|${p.set || ''}|${norm(p.name) || norm(p.fullName)}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        brand: p.brand,
        set:   p.set || '',
        name:  p.name || p.fullName || '(без названия)',
        variants: 0,
        hasPhoto: false,
        createdAt: null,
        noCreatedAt: true,
        qty: 0,
        sum: 0,
        ids: [],
      });
    }
    const u = map.get(key);
    u.variants += 1;
    u.ids.push(String(p._id));
    if ((p.driveImages?.length || 0) + (p.images?.length || 0) > 0) u.hasPhoto = true;
    if (p.createdAt) {
      u.noCreatedAt = false;
      // Возраст модели — по самому раннему варианту: перекрашенный товар не новинка.
      if (!u.createdAt || p.createdAt < u.createdAt) u.createdAt = p.createdAt;
    }
  }
  return [...map.values()];
}

// ── 2. Продажи → штуки на единицу ────────────────────────────────────────────
// Возвраты в выгрузке 1С приходят с положительным количеством при отрицательной
// сумме — знак берём у суммы (как в отчёте по агентам).
const netQty = r => (r.sum < 0 ? -Math.abs(r.quantity || 0) : (r.quantity || 0));

function attachSales(units, products, records) {
  const unitByProductId = new Map();
  for (const u of units) for (const id of u.ids) unitByProductId.set(id, u);

  // Запасные ключи: у части строк 1С нет productId — цепляемся за артикул и название.
  const bySku  = new Map();
  const byName = new Map();
  for (const p of products) {
    const u = unitByProductId.get(String(p._id));
    if (!u) continue;
    for (const s of [p.sku, p.skuByBase?.makein, p.skuByBase?.matkasym, p.skuByBase?.qtop]) {
      const k = norm(s);
      if (k && !bySku.has(k)) bySku.set(k, u);
    }
    for (const n of [p.name, p.fullName, p.nomenclature1C]) {
      const k = norm(n);
      if (k && !byName.has(k)) byName.set(k, u);
    }
  }

  const stat = { matched: 0, unmatched: 0, unmatchedQty: 0 };
  for (const r of records) {
    const u = (r.productId && unitByProductId.get(String(r.productId)))
      || bySku.get(norm(r.sku))
      || byName.get(norm(r.productName));
    const q = netQty(r);
    if (!u) { stat.unmatched += 1; stat.unmatchedQty += q; continue; }
    stat.matched += 1;
    u.qty += q;
    u.sum += r.sum || 0;
  }
  return stat;
}

// ── 3. A / B / C / D ─────────────────────────────────────────────────────────
function classify(units, now) {
  const freshEdge = new Date(now.getTime() - NEW_DAYS * 864e5);
  const groups = new Map();
  for (const u of units) {
    const key = SCOPE === 'set' ? `${u.brand}|${u.set}` : u.brand;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }

  for (const list of groups.values()) {
    const fresh = [], rest = [];
    for (const u of list) {
      // Товары без createdAt новинками не считаем: даты у них нет не потому, что они
      // старые, а из-за поля isNew в схеме — оно ломало timestamps при Product.create.
      const isFresh = !!u.createdAt && u.createdAt >= freshEdge;
      (isFresh ? fresh : rest).push(u);
    }
    for (const u of fresh) u.abc = 'C';

    const total = rest.reduce((s, u) => s + Math.max(0, u.qty), 0);
    rest.sort((a, b) => b.qty - a.qty);
    let cum = 0;
    for (const u of rest) {
      if (u.qty <= 0) { u.abc = 'D'; continue; }
      const before = cum;
      cum += u.qty;
      u.abc = (total > 0 && before / total < A_SHARE / 100) ? 'A' : 'B';
    }
  }
}

// ── 4. Сет → дни постинга ────────────────────────────────────────────────────
// Каждый день добираем PER_DAY постов, каждый раз отдавая слот той категории,
// которая сильнее всех отстала от своей доли. Пока пулы не пусты, это ровно
// заданный микс; когда категория кончается, слоты уходят оставшимся — сет
// доигрывается до конца, а не встаёт из-за пустого C.
function planSet(pools) {
  const left = { A: [...pools.A], B: [...pools.B], C: [...pools.C] };
  const done = { A: 0, B: 0, C: 0 };
  let total = left.A.length + left.B.length + left.C.length;
  const days = [];

  while (total > 0) {
    const slots = [];
    for (let i = 0; i < PER_DAY && total > 0; i++) {
      const posted = done.A + done.B + done.C;
      const cat = ['A', 'B', 'C']
        .filter(c => left[c].length)
        .map(c => ({ c, gap: MIX[c] * (posted + 1) - done[c] }))
        .sort((x, y) => y.gap - x.gap || 'ABC'.indexOf(x.c) - 'ABC'.indexOf(y.c))[0].c;
      const item = left[cat].shift();
      slots.push({ abc: cat, name: item.name, key: item.key, qty: item.qty });
      done[cat] += 1;
      total -= 1;
    }
    days.push(slots);
  }
  return days;
}

// Сколько дней микс держится строго — до первой опустевшей категории.
function strictMixDays(pools) {
  const cand = ['A', 'B', 'C']
    .filter(c => MIX[c] > 0)
    .map(c => pools[c].length / (PER_DAY * MIX[c]));
  return cand.length ? Math.min(...cand) : 0;
}

// ── 5. Раздача сетов дизайнерам ──────────────────────────────────────────────
// Балансируем по объёму работы, а не по числу сетов: сеты разного размера, и три
// сета по 8 товаров — это не то же самое, что один на 60.
function assign(sets, designers) {
  const queues = designers.map(name => ({ name, sets: [], posts: 0 }));
  for (const s of [...sets].sort((a, b) => b.total - a.total)) {
    const q = queues.reduce((min, cur) => (cur.posts < min.posts ? cur : min), queues[0]);
    q.sets.push(s);
    q.posts += s.total;
  }
  return queues;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  await mongoose.connect(MONGO_URI);
  const now = new Date();
  const since = new Date(now.getTime() - MONTHS * 30 * 864e5);

  const brands = await Brand.find().sort({ order: 1 }).lean();
  const setLabel = new Map();
  const brandOrder = new Map();
  brands.forEach((b, i) => {
    brandOrder.set(b.key, i);
    (b.sets || []).forEach(s => setLabel.set(`${b.key}|${s.key}`, s.label || s.key));
  });

  const filter = { productStatus: { $in: STATUSES }, category: { $ne: 'kit-part' } };
  if (BRAND_ONLY) filter.brand = BRAND_ONLY;

  const products = await Product.find(filter)
    .select('name fullName nomenclature1C sku skuByBase brand set images driveImages createdAt productStatus')
    .lean();

  const records = await SalesRecord.find({ docDate: { $gte: since } })
    .select('productId sku productName quantity sum')
    .lean();

  let units = buildUnits(products);
  const noPhoto = units.filter(u => !u.hasPhoto).length;
  const noDate  = units.filter(u => u.noCreatedAt).length;
  if (REQ_PHOTO) units = units.filter(u => u.hasPhoto);

  const salesStat = attachSales(units, products, records);
  classify(units, now);

  // ── группировка по бренду и сету ───────────────────────────────────────────
  const sets = new Map();
  for (const u of units) {
    const key = `${u.brand}|${u.set}`;
    if (!sets.has(key)) {
      sets.set(key, {
        key,
        brand: u.brand,
        set:   u.set || '(без сета)',
        label: setLabel.get(key) || (u.set || '(без сета)'),
        A: [], B: [], C: [], D: [],
      });
    }
    sets.get(key)[u.abc].push(u);
  }

  for (const s of sets.values()) {
    for (const list of [s.A, s.B, s.C, s.D]) list.sort((a, b) => b.qty - a.qty);
    if (INC_DEAD) { s.B = s.B.concat(s.D); s.D = []; }
    s.total = s.A.length + s.B.length + s.C.length;
    s.days  = Math.ceil(s.total / PER_DAY);
    s.mixDays = strictMixDays(s);
  }

  const setList = [...sets.values()]
    .filter(s => s.total > 0)
    .sort((a, b) => (brandOrder.get(a.brand) ?? 99) - (brandOrder.get(b.brand) ?? 99) || b.total - a.total);

  // ── печать: параметры и данные ─────────────────────────────────────────────
  const totalUnits = setList.reduce((n, s) => n + s.total, 0);
  const totalDead  = [...sets.values()].reduce((n, s) => n + s.D.length, 0);

  console.log('\n═══ КОНТЕНТ-ПЛАН ═══════════════════════════════════════════════\n');
  console.log(`Норма:        ${PER_DAY} постов в день на дизайнера`);
  console.log(`Микс:         A ${Math.round(MIX.A * 100)}% / B ${Math.round(MIX.B * 100)}% / C ${Math.round(MIX.C * 100)}%`);
  console.log(`Дизайнеры:    ${DESIGNERS.length} (${DESIGNERS.join(', ')})`);
  console.log(`Продажи:      с ${since.toLocaleDateString('ru-RU')} (${MONTHS} мес), строк 1С — ${records.length}`);
  console.log(`Новинка (C):  моложе ${NEW_DAYS} дней`);
  console.log(`A по Парето:  верхушка на ${A_SHARE}% проданных штук, сравнение внутри — ${SCOPE === 'set' ? 'сета' : 'бренда'}`);
  console.log(`Единица:      ${UNIT === 'sku' ? 'артикул (каждый вариант — свой пост)' : 'модель (варианты одного name — один пост)'}`);
  console.log(`Статусы:      ${STATUSES.join(', ')}\n`);

  console.log(`Товаров в базе под фильтр: ${products.length} → единиц контента: ${totalUnits}`);
  console.log(`Сопоставлено строк продаж: ${salesStat.matched} (не легло на каталог — ${salesStat.unmatched}, ${pct(salesStat.unmatched, records.length)})`);
  console.log(`Без фото: ${noPhoto}${REQ_PHOTO ? ' — выкинуты из плана' : ' — в плане остались, снимать нечего'}`);
  console.log(`Без даты создания: ${noDate} — новинками не считаются`);
  console.log(`Спящие (D, нет продаж за период): ${totalDead}${INC_DEAD ? ' — подмешаны в B' : ' — в план не идут'}\n`);

  // ── печать: бренды и сеты ──────────────────────────────────────────────────
  console.log('─── СЕТЫ ───────────────────────────────────────────────────────');
  console.log(`${pad('Сет', 24)}${padL('всего', 6)}${padL('A', 5)}${padL('B', 5)}${padL('C', 5)}${padL('спящ', 6)}${padL('дней', 6)}  микс держится`);
  let lastBrand = null;
  for (const s of setList) {
    if (s.brand !== lastBrand) {
      lastBrand = s.brand;
      console.log(`\n▌${BRAND_LABEL[s.brand] || s.brand}`);
    }
    const warn = s.C.length === 0 ? '  ⚠ нет новинок' : '';
    console.log(
      pad(s.label, 24) + padL(s.total, 6) + padL(s.A.length, 5) + padL(s.B.length, 5) +
      padL(s.C.length, 5) + padL(s.D.length, 6) + padL(s.days, 6) +
      padL(`${s.mixDays.toFixed(1)} дн`, 10) + warn
    );
  }

  // ── печать: раздача дизайнерам ─────────────────────────────────────────────
  const queues = assign(setList, DESIGNERS);
  console.log('\n─── РАЗДАЧА СЕТОВ ──────────────────────────────────────────────');
  for (const q of queues) {
    const days = Math.ceil(q.posts / PER_DAY);
    console.log(`\n${q.name}: ${SETS(q.sets.length)}, ${POSTS(q.posts)} ≈ ${DAYS(days)} работы`);
    for (const s of q.sets) {
      console.log(`   · ${pad(s.label, 22)} ${padL(s.total, 4)} постов  ${padL(s.days, 3)} дн   ` +
        `A${s.A.length}/B${s.B.length}/C${s.C.length}`);
    }
  }

  // ── печать: график ─────────────────────────────────────────────────────────
  const timelines = queues.map(q => {
    const days = [];
    for (const s of q.sets) for (const slots of planSet(s)) days.push({ set: s.label, slots });
    return { name: q.name, days };
  });

  const dates = workdays(Math.max(PRINT_DAYS, ...timelines.map(t => t.days.length)));
  console.log(`\n─── ГРАФИК (первые ${PRINT_DAYS} рабочих дн.) ────────────────────────`);
  for (const t of timelines) {
    console.log(`\n${t.name}`);
    t.days.slice(0, PRINT_DAYS).forEach((d, i) => {
      const dt = dates[i];
      const head = `  ${WEEKDAYS[dt.getDay()]} ${dmy(dt)}  ${pad(d.set, 18)}`;
      const tail = d.slots.map(s => `${s.abc}:${s.name}`).join(' · ');
      console.log(head + tail);
    });
    if (t.days.length > PRINT_DAYS) console.log(`  … ещё ${t.days.length - PRINT_DAYS} дн.`);
  }

  // ── печать: выводы ─────────────────────────────────────────────────────────
  console.log('\n─── ЧТО ИЗ ЭТОГО СЛЕДУЕТ ───────────────────────────────────────');
  const longest = Math.max(...timelines.map(t => t.days.length), 0);
  const monthDays = DAYS_OFF === 0 ? 30 : DAYS_OFF === 1 ? 26 : 22;
  const perDayForMonth = Math.ceil(totalUnits / DESIGNERS.length / monthDays);
  console.log(`Весь каталог пройдёт за ${DAYS(longest)} при норме ${PER_DAY}/день на ${DESIGNERS.length} ${plural(DESIGNERS.length, ['дизайнера', 'дизайнеров', 'дизайнеров'])}.`);
  console.log(`Чтобы прокрутить всё за месяц (${DAYS(monthDays)} работы), нужно ≈${POSTS(perDayForMonth)}/день на дизайнера.`);

  const allA = setList.reduce((n, s) => n + s.A.length, 0);
  const allB = setList.reduce((n, s) => n + s.B.length, 0);
  const allC = setList.reduce((n, s) => n + s.C.length, 0);
  console.log(`\nФактический состав каталога: A ${pct(allA, totalUnits)} · B ${pct(allB, totalUnits)} · C ${pct(allC, totalUnits)}` +
    ` — против плана постов ${Math.round(MIX.A * 100)}/${Math.round(MIX.B * 100)}/${Math.round(MIX.C * 100)}.`);
  console.log('Разрыв означает повторы: чем меньше товаров в категории, тем чаще один и тот же товар выходит в эфир.');
  // Один и тот же товар вернётся в эфир, когда пул прокрутится целиком.
  const cycle = (pool, share) => (share > 0 ? pool / DESIGNERS.length / (PER_DAY * share) : 0);
  const cycleText = d => (d < 1 ? 'чаще чем раз в день — пул слишком мал' : `раз в ${d.toFixed(1)} дн.`);
  if (allA) console.log(`   A-товар выходит повторно ${cycleText(cycle(allA, MIX.A))}`);
  if (allC) console.log(`   C-новинок хватит на ${cycle(allC, MIX.C).toFixed(1)} дн. постинга без повтора.`);

  const noNew = setList.filter(s => !s.C.length);
  if (noNew.length) {
    console.log(`\n⚠ Сеты без новинок (${noNew.length}): ${noNew.map(s => s.label).join(', ')}.`);
    console.log('  Их 10% уходят в A и B — либо заводить новинки, либо для таких сетов микс другой.');
  }
  const thin = setList.filter(s => s.days < 5);
  if (thin.length) {
    console.log(`\n⚠ Сеты меньше недели работы (${thin.length}): ${thin.map(s => `${s.label} (${s.days} дн)`).join(', ')}.`);
    console.log('  Дизайнеру их надо давать пачкой, иначе он каждые пару дней меняет тему.');
  }

  // ── JSON ───────────────────────────────────────────────────────────────────
  if (JSON_OUT) {
    const out = path.resolve(__dirname, JSON_OUT);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({
      generatedAt: now,
      params: { perDay: PER_DAY, mix: MIX, months: MONTHS, newDays: NEW_DAYS, aShare: A_SHARE, scope: SCOPE, unit: UNIT, statuses: STATUSES },
      sets: setList.map(s => ({
        brand: s.brand, set: s.set, label: s.label, total: s.total, days: s.days,
        A: s.A.map(u => u.name), B: s.B.map(u => u.name), C: s.C.map(u => u.name), D: s.D.map(u => u.name),
      })),
      designers: timelines.map((t, i) => ({
        name: t.name,
        sets: queues[i].sets.map(s => s.label),
        schedule: t.days.map((d, idx) => ({
          date: dates[idx] ? ymd(dates[idx]) : null,
          set: d.set,
          posts: d.slots,
        })),
      })),
    }, null, 2));
    console.log(`\n💾 Полный план: ${out}`);
  }

  console.log('');
  await mongoose.disconnect();
})().catch(async e => {
  console.error('Ошибка:', e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
