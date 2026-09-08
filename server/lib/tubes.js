/**
 * Трубы: разбор названия в геометрию.
 *
 * Одну и ту же трубу 1С и сайт называют по-разному:
 *   1С      «ПФ Труба Ф25*0,9мм», «ПФ Профиль 31x15*0,9мм (полуовальный)»
 *   каталог «Труба круглая 25×0,9»,  «Труба овальная 31x15x0,9»
 * Связывать их по имени бесполезно, поэтому обе стороны разбираются в ключ
 * «форма + сечение + стенка»: он одинаков, как бы номенклатуру ни писали.
 *
 * Разделители в названиях гуляют (× x х * , .), а последнее число — всегда
 * толщина стенки: перед ней 1 число у круглой и 2 у профиля.
 */

// Длина хлыста. Остаток труб 1С ведёт в метрах, продают их шестиметровыми —
// «26 113 м» на складе это 4352 трубы, и на складе считают именно трубами.
const PIPE_LENGTH_M = 6;

const ROUND = 'Круглая', SQUARE = 'Квадратная', RECT = 'Прямоугольная', OVAL = 'Овальная';
const SHAPES = [ROUND, SQUARE, RECT, OVAL];

/**
 * «ПФ Профиль 31x15*0,9мм (полуовальный)» → { shape: 'Овальная', dims: [31,15], wall: 0.9 }
 * → null, если это не труба (в сете лежат ещё услуги вроде лазерной резки).
 */
function parseTube(raw) {
  const s = String(raw || '').toLowerCase().replace(/[«»"]/g, ' ');
  // Числа: запятая — десятичная («0,9мм»), разделители сечения не важны
  const nums = (s.match(/\d+(?:[.,]\d+)?/g) || []).map(n => Number(n.replace(',', '.')));
  if (nums.length < 2 || nums.length > 3) return null;

  const wall = nums[nums.length - 1];
  const dims = nums.slice(0, -1);
  // Стенка тоньше 3 мм, сечение — от 8 мм: перепутать их местами нельзя
  if (!(wall > 0 && wall < 3) || dims.some(d => !(d >= 5 && d <= 400))) return null;

  let shape = null;
  if (/овал/.test(s))                     shape = OVAL;      // «полуовальный» тоже
  else if (/прямоуголь/.test(s))          shape = RECT;
  else if (/квадрат/.test(s))             shape = SQUARE;
  else if (/кругл/.test(s) || /\bф\s*\d/.test(s)) shape = ROUND;
  else if (dims.length === 1)             shape = ROUND;
  else shape = dims[0] === dims[1] ? SQUARE : RECT;

  if (shape === ROUND && dims.length !== 1) return null;
  if (shape !== ROUND && dims.length !== 2) return null;

  return { shape, dims: shape === ROUND ? dims : [...dims].sort((a, b) => b - a), wall };
}

// Ключ сравнения: у профиля стороны сортируем по убыванию — 1С пишет
// «10х24 (Полуовальный)», сайт «31x15», порядок сторон у них не совпадает.
const tubeKey = t => t && `${t.shape}|${t.dims.join('x')}|${t.wall}`;
const keyOfName = raw => tubeKey(parseTube(raw));

// Сколько шестиметровых труб в метраже. Остаток на складе неполными хлыстами
// не бывает, поэтому вниз.
const pipesOf = (meters, length = PIPE_LENGTH_M) =>
  Math.floor(Math.max(0, Number(meters) || 0) / length);

module.exports = { parseTube, tubeKey, keyOfName, pipesOf, PIPE_LENGTH_M, SHAPES, ROUND, SQUARE, RECT, OVAL };
