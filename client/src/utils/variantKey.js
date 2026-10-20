// Варианты одной модели в каталоге HOME: товары, которые отличаются только
// цветом или размером, а цвет/размер вписан прямо в название — «Стул MARIUS 45
// белый» и «…черный», «KORKEN 0,5л / 1л / 2л», «Сушилка 40*40 / 50*40».
// Ключ модели — название без цвета, размеров, объёма, штук и хвостов поставки
// (AP, JP, CN), слова по алфавиту: «RÅSKOG тележка» и «Тележка RÅSKOG» — одно.
// Коды моделей («бутылка 1902» и «бутылка 468») оставляем — это разные товары.

const COLOR_STEMS = [
  'бел', 'черн', 'чёрн', 'сер', 'зелен', 'зелён', 'красн', 'син', 'голуб', 'желт', 'жёлт',
  'бежев', 'розов', 'фиолет', 'коричн', 'оранж', 'бирюз', 'антрацит', 'серебрист',
  'кремов', 'прозрачн', 'натуральн', 'графит', 'золот', 'молочн', 'бордов', 'хаки', 'мятн',
];
const SHADE = '(?:светло|темно|тёмно|бледно)-?';
const STEM = `(?:${COLOR_STEMS.join('|')})[а-яё]*`;
const COLOR_RE = new RegExp(`(?<![а-яёa-z])(?:${SHADE})?${STEM}(?:-(?:${SHADE})?${STEM})*(?![а-яёa-z])`, 'gi');

const NUM = '\\d+(?:[.,]\\d+)?';
const DIM_RE   = new RegExp(`${NUM}\\s*[xх×*]\\s*${NUM}(?:\\s*[xх×*]\\s*${NUM})?\\s*(?:см|мм|m|cm)?`, 'gi');
const VOL_RE   = new RegExp(`${NUM}\\s*(?:мл|ml|л|l)(?![а-яёa-z])(?:\\s*/\\s*${NUM}\\s*(?:мл|ml|л|l)(?![а-яёa-z]))?`, 'gi');
const PCS_RE   = new RegExp(`${NUM}\\s*(?:шт|предм[а-яё]*|п)(?![а-яёa-z])\\.?`, 'gi');
const SUPPLY_RE = /(?<![а-яёa-z])(?:ap|jp|cn|ап|aп)(?![а-яёa-z])/gi;

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');

// То, чем вариант отличается от соседей: цвет и размер из названия
export function variantParts(name) {
  const s = String(name || '');
  const found = [];
  [DIM_RE, VOL_RE, PCS_RE, COLOR_RE].forEach(re => {
    (s.match(re) || []).forEach(m => found.push(m.trim()));
  });
  return found;
}

export function variantKey(name) {
  let s = norm(name);
  [DIM_RE, VOL_RE, PCS_RE, COLOR_RE, SUPPLY_RE].forEach(re => { s = s.replace(re, ' '); });
  const words = s.replace(/[(),/«»"'.:;]+/g, ' ').replace(/\s-\s|\s-|-\s/g, ' ')
    .split(/\s+/).filter(Boolean);
  return [...new Set(words)].sort().join(' ');
}

// Заголовок общей карточки: название без цвета и размера —
// «Стул MARIUS 45 белый AP JP» → «Стул MARIUS 45»
export function variantTitle(name) {
  let s = String(name || '');
  [DIM_RE, VOL_RE, PCS_RE, COLOR_RE, SUPPLY_RE].forEach(re => { s = s.replace(re, ' '); });
  return s.replace(/\(\s*[/,]*\s*\)/g, ' ').replace(/,(\s*,)+/g, ',').replace(/\s+([,)])/g, '$1')
    .replace(/\s+/g, ' ').replace(/[\s,/\-–]+$/, '').replace(/^[\s,/\-–]+/, '').trim() || String(name || '');
}
