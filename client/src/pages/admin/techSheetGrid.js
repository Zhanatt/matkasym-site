/**
 * Поиск таблицы согласования на отрендеренной странице техлиста.
 *
 * Модуль намеренно не знает ни про pdf.js, ни про DOM: на вход — маска тёмных
 * пикселей страницы, на выход — прямоугольники ячеек. Так геометрию можно
 * прогнать тестом на реальном листе, не поднимая браузер.
 *
 * Таблицу собираем снизу вверх из отдельных строк: строка — это пара соседних
 * горизонтальных линий, между которыми стоят вертикали от края до края ячейки.
 * Разбор по строкам, а не по «пачке линий», не путается, когда рядом с
 * таблицей проходит рамка листа или линия соседнего блока.
 */

// Линии бланка бывают почти белёсыми — светло-голубая сетка попадается не
// реже чёрной, поэтому в разметку берём всё, что заметно темнее бумаги.
const LINE = 235;
// Чернила — только настоящий текст. По этому порогу считаем, подписана
// ячейка или пуста, иначе светлая сетка сама сошла бы за надпись.
const INK = 190;

// Две маски одного листа: по первой ищем линии, по второй — текст.
export function masksFromRGBA(data, W, H) {
  const line = new Uint8Array(W * H);
  const ink  = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < line.length; i++, p += 4) {
    const lum = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    if (lum < LINE) line[i] = 1;
    if (lum < INK)  ink[i]  = 1;
  }
  return { line, ink };
}

// Линия — это длинный непрерывный ряд тёмных пикселей: пунктир и текст такой
// длины не дают, рамка ячейки даёт. Берём все такие пробеги ряда с их краями —
// на одной высоте листа бывают линии двух разных таблиц, стоящих рядом.
function rowRuns(mask, W, y, min) {
  const runs = [];
  const base = y * W;
  let start = -1;
  for (let x = 0; x <= W; x++) {
    const dark = x < W && mask[base + x];
    if (dark && start < 0) start = x;
    if (!dark && start >= 0) {
      if (x - start >= min) runs.push([start, x - 1]);
      start = -1;
    }
  }
  return runs;
}

function colRun(mask, W, x, y0, y1) {
  let best = 0, cur = 0;
  for (let y = y0; y <= y1; y++) {
    cur = mask[y * W + x] ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

// Линия толщиной в 2–3 пикселя даёт подряд несколько «линейных» рядов —
// схлопываем их в одну координату.
function cluster(values, gap = 2) {
  if (!values.length) return [];
  const out = [];
  let cur = [values[0]];
  for (const v of values.slice(1)) {
    if (v - cur[cur.length - 1] <= gap) cur.push(v);
    else { out.push(cur); cur = [v]; }
  }
  out.push(cur);
  return out.map(c => Math.round(c.reduce((a, b) => a + b, 0) / c.length));
}

const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);

// Горизонтальные линии вместе с их протяжённостью. Толстая линия даёт подряд
// несколько рядов — склеиваем их в одну, если они лежат друг над другом.
function horizontalLines(mask, W, H) {
  const min = W * 0.15;
  const open = [], done = [];
  // Края листа сами по себе дают линию во всю ширину — таблицей они не бывают.
  for (let y = Math.ceil(H * 0.01); y < H * 0.99; y++) {
    for (const [x0, x1] of rowRuns(mask, W, y, min)) {
      const seg = open.find(s => y - s.last <= 2 && overlap(s, { x0, x1 }) > 0);
      if (seg) {
        seg.ys.push(y); seg.last = y;
        seg.x0 = Math.min(seg.x0, x0); seg.x1 = Math.max(seg.x1, x1);
      } else {
        open.push({ ys: [y], last: y, x0, x1 });
      }
    }
    for (let i = open.length - 1; i >= 0; i--) {
      if (y - open[i].last > 2) done.push(...open.splice(i, 1));
    }
  }
  done.push(...open);
  done.sort((a, b) => a.ys[0] - b.ys[0]);

  // Одна толстая линия бывает разорвана текстом или стыком на разных рядах
  // пикселей и даёт два куска почти на одной высоте. Склеиваем, иначе строка
  // возьмёт короткий кусок за свою нижнюю границу и обрежется по ширине.
  // Высота линии — середина всех её рядов: по краю толстой линии граница
  // строки съехала бы на рамку, и пустая ячейка показалась бы исписанной.
  const merged = [];
  for (const s of done) {
    const twin = merged.find(m => s.ys[0] - m.ys[m.ys.length - 1] <= 3 && overlap(m, s) > 0);
    if (twin) {
      twin.ys.push(...s.ys);
      twin.x0 = Math.min(twin.x0, s.x0); twin.x1 = Math.max(twin.x1, s.x1);
    } else {
      merged.push({ ys: [...s.ys], x0: s.x0, x1: s.x1 });
    }
  }
  return merged
    .map(s => ({ y: Math.round(s.ys.reduce((a, b) => a + b, 0) / s.ys.length), x0: s.x0, x1: s.x1 }))
    .sort((a, b) => a.y - b.y);
}

function verticalsInBand(mask, W, y0, y1, minFrac, xFrom = W * 0.01, xTo = W * 0.99) {
  const need = (y1 - y0) * minFrac;
  const xs = [];
  for (let x = Math.ceil(xFrom); x < xTo; x++) {
    if (colRun(mask, W, x, y0, y1) >= need) xs.push(x);
  }
  return cluster(xs);
}

// Доля тёмных пикселей в прямоугольнике: по ней отличаем ячейку с надписью
// от пустой, куда и надо писать.
function inkRatio(mask, W, x0, x1, y0, y1) {
  const width = x1 - x0 + 1;
  let dark = 0, total = 0;
  for (let y = y0; y <= y1; y++) {
    let row = 0;
    for (let x = x0; x <= x1; x++) row += mask[y * W + x];
    total += width;
    // Ряд, закрашенный почти целиком, — край рамки, залезший в ячейку
    // (толстая линия шире отступа от границы), а не надпись.
    if (row <= width * 0.7) dark += row;
  }
  return total ? dark / total : 0;
}

// Базовая линия надписи в ячейке: нижний край основной массы букв. По ней
// сажаем вписываемый текст, чтобы он стоял на одной линии с ролью слева, а
// не «плавал» по центру ячейки. Редкие нижние выносы (р, у, д) отсекает порог.
function baselineOf(mask, W, x0, x1, y0, y1) {
  const width = x1 - x0 + 1;
  const counts = [];
  for (let y = y0; y <= y1; y++) {
    let c = 0;
    for (let x = x0; x <= x1; x++) c += mask[y * W + x];
    // Ряд, закрашенный почти целиком, — это рамка бланка, а не строка текста.
    // Толстая рамка не всегда влезает в отступ от границы ячейки, и без этой
    // проверки подпись садится на неё, то есть в соседнюю строку таблицы.
    counts.push(c > width * 0.7 ? 0 : c);
  }
  const max = Math.max(...counts);
  if (!max) return null;
  const threshold = max * 0.15;
  for (let i = counts.length - 1; i >= 0; i--) {
    if (counts[i] >= threshold) {
      const y = y0 + i;
      // Базовая линия текста не может стоять вплотную к краю ячейки: если
      // вышло так, значит поймали не буквы — лучше вернуться к центру строки.
      const h = y1 - y0;
      return (y - y0) > h * 0.25 && (y1 - y) > h * 0.05 ? y : null;
    }
  }
  return null;
}

/**
 * Ищем таблицу согласования и в ней — строки, куда вписывают подписанта.
 * @returns {{rows: {y0,y1,x0,x1}[], bottom: number} | null} координаты в пикселях
 */
export function findApprovalRows(masks, W, H) {
  const { line: mask, ink } = masks;
  const hs = horizontalLines(mask, W, H);
  if (hs.length < 2) return null;

  // Строка бланка — высотой в одну текстовую строку. Всё, что выше, — уже
  // не строка таблицы, а расстояние до соседнего блока листа.
  const MIN_ROW = Math.max(10, H * 0.008);
  const MAX_ROW = H * 0.09;

  // Строки-кандидаты: между линиями стоит рамка ячеек шириной с таблицу.
  // Верхнюю и нижнюю линию строки берём из одной таблицы — ближайшую снизу,
  // что лежит под верхней по всей длине. Иначе, когда рядом на той же высоте
  // стоит другая таблица (характеристики слева от согласования), их линии
  // перемежаются, строки дробятся на узкие полосы, и подпись уходит не в ту
  // таблицу, да ещё и мелким шрифтом по высоте полосы.
  const strips = [];
  for (let i = 0; i < hs.length; i++) {
    const top = hs[i];
    const bottom = hs.slice(i + 1).find(b => b.y > top.y + 2
      && overlap(top, b) >= Math.min(top.x1 - top.x0, b.x1 - b.x0) * 0.9);
    if (!bottom) continue;
    const y0 = top.y, y1 = bottom.y;
    const gap = y1 - y0;
    if (gap < MIN_ROW || gap > MAX_ROW) continue;
    // Запас по краям: угол рамки сглажен, и одна из линий бывает короче на
    // несколько пикселей. Больше не берём — соседняя таблица стоит в 30–40 px.
    const xFrom = Math.max(top.x0, bottom.x0) - 12, xTo = Math.min(top.x1, bottom.x1) + 13;
    const v = verticalsInBand(mask, W, y0 + 3, y1 - 3, 0.85, xFrom, xTo);
    if (v.length < 2) continue;
    const left = v[0], right = v[v.length - 1];
    if (right - left < W * 0.3) continue;
    strips.push({ y0, y1, left, right, inner: v.slice(1, -1) });
  }
  if (!strips.length) return null;

  // Соседние строки одной таблицы стоят вплотную и делят общие боковые рамки.
  // Строки соседних по высоте таблиц перемежаются, поэтому каждую строку
  // приставляем к той таблице, чью нижнюю строку она продолжает.
  const tables = [];
  for (const s of strips) {
    const t = tables.find(rows => {
      const prev = rows[rows.length - 1];
      return Math.abs(s.y0 - prev.y1) <= 3
        && Math.abs(s.left - prev.left) <= 4
        && Math.abs(s.right - prev.right) <= 4;
    });
    if (t) t.push(s);
    else tables.push([s]);
  }

  const candidates = [];
  for (const t of tables) {
    const rows = [];
    for (const s of t) {
      // Строка подписанта устроена одинаково: слева напечатана роль, справа
      // пустая ячейка под запись. Ищем именно такую пару соседних ячеек — по
      // содержимому, а не по позиции: у листа бывает своя рамка, и «первый
      // столбец» не всегда первый по счёту. Заодно это отсекает и шапку
      // таблицы (там подписаны обе ячейки), и рамки чертежа (там пусты обе).
      const xs = [s.left, ...s.inner, s.right];
      for (let k = 0; k + 2 < xs.length; k++) {
        const label = inkRatio(ink, W, xs[k] + 3, xs[k + 1] - 3, s.y0 + 3, s.y1 - 3);
        const value = inkRatio(ink, W, xs[k + 1] + 3, xs[k + 2] - 3, s.y0 + 3, s.y1 - 3);
        const wide  = xs[k + 2] - xs[k + 1] >= (s.right - s.left) * 0.1;
        if (label > 0.02 && value < 0.01 && wide) {
          const baseline = baselineOf(ink, W, xs[k] + 3, xs[k + 1] - 3, s.y0 + 3, s.y1 - 3);
          rows.push({ y0: s.y0, y1: s.y1, x0: xs[k + 1], x1: xs[k + 2], baseline });
          break;
        }
      }
    }
    // Таблица согласования — это всегда несколько строк подряд (менеджер,
    // заказчик, разработчик). Одинокая ячейка почти наверняка часть чертежа.
    if (rows.length >= 2) candidates.push({ rows, bottom: t[t.length - 1].y1 });
  }
  if (!candidates.length) return null;

  // В таблице согласования три подписанта — менеджер, заказчик, разработчик.
  // Ближе всего к этому числу строк и берём: в штампе чертежа рядом бывает
  // столбик «Материал / Цвет / Установка» такого же устройства, но длиннее.
  // Дальше — самая содержательная и нижняя на листе.
  const off = c => Math.abs(c.rows.length - 3);
  candidates.sort((a, b) => (off(a) - off(b)) || (b.rows.length - a.rows.length) || (b.bottom - a.bottom));
  return candidates[0];
}
