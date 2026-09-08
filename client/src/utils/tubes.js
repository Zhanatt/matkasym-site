// Трубы продают метрами, а считают на складе хлыстами: 26 113 м — это 4352
// шестиметровых трубы. Остаток из 1С приходит в метрах, поэтому рядом с ним
// везде показываем второе число — иначе метры читаются как штуки.
export const PIPE_LENGTH_M = 6;

export const isTubes = p => (p?.unit === 'м') && (p?.set === 'dayar-tutuk' || /^трубы/i.test(p?.category || ''));

export const pipesOf = (meters, length = PIPE_LENGTH_M) =>
  Math.floor(Math.max(0, Number(meters) || 0) / length);

// «131 труба» / «3304 трубы» / «1500 труб»
export function pipesLabel(meters, length = PIPE_LENGTH_M) {
  const n = pipesOf(meters, length);
  const tens = n % 100, ones = n % 10;
  const word = tens >= 11 && tens <= 14 ? 'труб'
    : ones === 1 ? 'труба'
    : ones >= 2 && ones <= 4 ? 'трубы'
    : 'труб';
  return `${n.toLocaleString('ru')} ${word}`;
}
