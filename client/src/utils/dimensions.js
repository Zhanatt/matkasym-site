// Подпись к полю dimensions. У круглых труб там лежит «⌀25 мм» — это диаметр,
// и подписывать его «Габаритами» неправильно.
export const dimensionLabel = (raw = '') => {
  const v = String(raw).trim();
  if (/^[⌀ØøΦф]/.test(v)) return 'Диаметр';
  const parts = v.replace(/[а-яёa-z.]+$/i, '').trim().split(/[×x*]/).filter(Boolean);
  return parts.length === 3 ? 'Габариты (Д × Ш × В)' : 'Габариты';
};

// Буква перед числом — это ось, а не часть размера: «H1850*W900*D400» значит
// высота 1850, ширина 900, глубина 400. Общая подпись «Габариты (Д × Ш × В)»
// на таком значении прямо врала: порядок там другой, и первое число — высота.
const AXIS = {
  h: 'Высота',  в: 'Высота',
  w: 'Ширина',  ш: 'Ширина',
  d: 'Глубина', г: 'Глубина',
  l: 'Длина',   д: 'Длина',
};

// Габариты по осям: [{ label, value }] и единица измерения — или null, если
// букв в значении нет и разобрать его на оси нельзя.
//
// Единица: если в строке её не написали, для размеченного буквами формата это
// миллиметры. Так пишет 1С и так стоит в самих названиях товаров («Тумба
// AICHUROK T 3 - H1031×460×620»): шкаф высотой 1850 — это 1,85 м, а не 18,5.
export const dimensionAxes = (raw = '') => {
  const v = String(raw).trim();
  if (!v || /^[⌀ØøΦф]/.test(v)) return null;

  const unitMatch = v.match(/[а-яё]+\.?$|[a-z]{2,}\.?$/i);
  const unit = unitMatch ? unitMatch[0] : '';
  const body = (unitMatch ? v.slice(0, -unit.length) : v).trim();

  const chunks = body.split(/[×x*]/i).map(s => s.trim()).filter(Boolean);
  if (chunks.length < 2) return null;

  const axes = [];
  for (const chunk of chunks) {
    const m = chunk.match(/^([a-zа-яё])\s*([\d]+(?:[.,]\d+)?)$/i);
    // Размечены должны быть все части: «H1850×900×400» — это не три оси, а
    // одна названная и две угаданные, а угадывать здесь как раз и не надо.
    if (!m) return null;
    const label = AXIS[m[1].toLowerCase()];
    if (!label) return null;
    axes.push({ label, value: m[2].replace(',', '.') });
  }
  return { axes, unit: unit || 'мм' };
};
