// Валюта цен товара — Product.currency, переключается в редакторе товара.
// Отсюда берётся подпись ВЕЗДЕ, где показываются цены товара: карточки, модалка,
// дашборд, поставщики, PDF. Серверная половина — signOf/fmtMoney в lib/stockBases.js.

export const CURRENCY_SIGN = { KGS: 'сом', KZT: '₸' };

// Для переключателя в редакторе товара.
export const CURRENCIES = [
  { value: 'KGS', label: 'Сом',   sign: 'сом' },
  { value: 'KZT', label: 'Тенге', sign: '₸'   },
];

// Товары, заведённые до появления поля, считаются сомовыми.
export const signOf = product => CURRENCY_SIGN[product?.currency] || CURRENCY_SIGN.KGS;

// «12 500 сом»; пустая цена — прочерк.
export const fmtMoney = (value, product) => {
  const n = Number(value || 0);
  return n > 0 ? `${n.toLocaleString('ru')} ${signOf(product)}` : '—';
};
