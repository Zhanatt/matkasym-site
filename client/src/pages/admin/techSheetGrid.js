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

// Порог «пикселя линии»: бланки печатают чёрным по белому, серая заливка
// шапок (~#e8eef7) в линии попадать не должна.
const DARK = 190;

// Маска тёмных пикселей из RGBA-массива канваса.
export function maskFromRGBA(data, W, H) {
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const lum = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    if (lum < DARK) mask[i] = 1;
  }
  return mask;
}

// Линия — это длинный непрерывный ряд тёмных пикселей. Считаем самый длинный
// пробег: пунктир и текст такой длины не дают, рамка ячейки даёт.
function rowRun(mask, W, y) {
  let best = 0, cur = 0;
  const base = y * W;
  for (let x = 0; x < W; x++) {
    cur = mask[base + x] ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
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

function horizontalLines(mask, W, H) {
  const min = W * 0.15;
  const ys = [];
  // Края листа сами по себе дают линию во всю ширину — таблицей они не бывают.
  for (let y = Math.ceil(H * 0.01); y < H * 0.99; y++) {
    if (rowRun(mask, W, y) >= min) ys.push(y);
  }
  return cluster(ys);
}

function verticalsInBand(mask, W, y0, y1, minFrac) {
  const need = (y1 - y0) * minFrac;
  const xs = [];
  for (let x = Math.ceil(W * 0.01); x < W * 0.99; x++) {
    if (colRun(mask, W, x, y0, y1) >= need) xs.push(x);
  }
  return cluster(xs);
}

// Доля тёмных пикселей в прямоугольнике: по ней отличаем ячейку с надписью
// от пустой, куда и надо писать.
function inkRatio(mask, W, x0, x1, y0, y1) {
  let dark = 0, total = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++, total++) dark += mask[y * W + x];
  }
  return total ? dark / total : 0;
}

/**
 * Ищем таблицу согласования и в ней — строки, куда вписывают подписанта.
 * @returns {{rows: {y0,y1,x0,x1}[], bottom: number} | null} координаты в пикселях
 */
export function findApprovalRows(mask, W, H) {
  const hs = horizontalLines(mask, W, H);
  if (hs.length < 2) return null;

  // Строка бланка — высотой в одну текстовую строку. Всё, что выше, — уже
  // не строка таблицы, а расстояние до соседнего блока листа.
  const MIN_ROW = Math.max(10, H * 0.008);
  const MAX_ROW = H * 0.09;

  // Строки-кандидаты: между линиями стоит рамка ячеек шириной с таблицу.
  const strips = [];
  for (let i = 0; i < hs.length - 1; i++) {
    const y0 = hs[i], y1 = hs[i + 1];
    const gap = y1 - y0;
    if (gap < MIN_ROW || gap > MAX_ROW) continue;
    const v = verticalsInBand(mask, W, y0 + 3, y1 - 3, 0.85);
    if (v.length < 2) continue;
    const left = v[0], right = v[v.length - 1];
    if (right - left < W * 0.3) continue;
    strips.push({ y0, y1, left, right, inner: v.slice(1, -1) });
  }
  if (!strips.length) return null;

  // Соседние строки одной таблицы стоят вплотную и делят общие боковые рамки.
  const tables = [];
  let cur = [strips[0]];
  for (const s of strips.slice(1)) {
    const prev = cur[cur.length - 1];
    const same = Math.abs(s.y0 - prev.y1) <= 3
      && Math.abs(s.left - prev.left) <= 4
      && Math.abs(s.right - prev.right) <= 4;
    if (same) cur.push(s);
    else { tables.push(cur); cur = [s]; }
  }
  tables.push(cur);

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
        const label = inkRatio(mask, W, xs[k] + 3, xs[k + 1] - 3, s.y0 + 3, s.y1 - 3);
        const value = inkRatio(mask, W, xs[k + 1] + 3, xs[k + 2] - 3, s.y0 + 3, s.y1 - 3);
        const wide  = xs[k + 2] - xs[k + 1] >= (s.right - s.left) * 0.1;
        if (label > 0.02 && value < 0.01 && wide) {
          rows.push({ y0: s.y0, y1: s.y1, x0: xs[k + 1], x1: xs[k + 2] });
          break;
        }
      }
    }
    // Таблица согласования — это всегда несколько строк подряд (менеджер,
    // заказчик, разработчик). Одинокая ячейка почти наверняка часть чертежа.
    if (rows.length >= 2) candidates.push({ rows, bottom: t[t.length - 1].y1 });
  }
  if (!candidates.length) return null;

  // Таблица согласования — самая содержательная и обычно нижняя на листе.
  candidates.sort((a, b) => (b.rows.length - a.rows.length) || (b.bottom - a.bottom));
  return candidates[0];
}
