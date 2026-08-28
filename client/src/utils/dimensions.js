// Подпись к полю dimensions. У круглых труб там лежит «⌀25 мм» — это диаметр,
// и подписывать его «Габаритами» неправильно.
export const dimensionLabel = (raw = '') => {
  const v = String(raw).trim();
  if (/^[⌀ØøΦф]/.test(v)) return 'Диаметр';
  const parts = v.replace(/[а-яёa-z.]+$/i, '').trim().split(/[×x*]/).filter(Boolean);
  return parts.length === 3 ? 'Габариты (Д × Ш × В)' : 'Габариты';
};
