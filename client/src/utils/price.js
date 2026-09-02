// Валюта цен товара — Product.currency, переключается в редакторе товара.
// Отсюда берётся подпись ВЕЗДЕ, где показываются цены товара: карточки, модалка,
// дашборд, поставщики, PDF. Серверная половина — signOf/fmtMoney в lib/stockBases.js.

export const CURRENCY_SIGN = { KGS: 'сом', KZT: '₸' };

// Для переключателя в редакторе товара.
export const CURRENCIES = [
  { value: 'KGS', label: 'Сом',   sign: 'сом' },
  { value: 'KZT', label: 'Тенге', sign: '₸'   },
];

// Валюты, в которых может считаться себестоимость: привозное закупают за юани
// и доллары, но продают всегда в валюте каталога.
export const COST_CURRENCIES = [
  { value: 'KGS', label: 'Сом',    sign: 'сом' },
  { value: 'KZT', label: 'Тенге',  sign: '₸'   },
  { value: 'CNY', label: 'Юань',   sign: '¥'   },
  { value: 'USD', label: 'Доллар', sign: '$'   },
];
const COST_SIGN = Object.fromEntries(COST_CURRENCIES.map(c => [c.value, c.sign]));

// Товары, заведённые до появления поля, считаются сомовыми.
export const signOf = product => CURRENCY_SIGN[product?.currency] || CURRENCY_SIGN.KGS;

// Знак для себестоимости — своя валюта товара, а не валюта продажи.
export const costSignOf = product => COST_SIGN[product?.costCurrency] || signOf(product);

// «12 500 сом»; пустая цена — прочерк.
export const fmtMoney = (value, product) => {
  const n = Number(value || 0);
  return n > 0 ? `${n.toLocaleString('ru')} ${signOf(product)}` : '—';
};
