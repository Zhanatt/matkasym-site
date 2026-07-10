// Зоны ответственности за буферный запас.
// Товары IKEA относятся к зоне ikea независимо от бренда.
// Бренд matkasym-kyzmat не закреплён ни за кем — товары в зону не попадают.

const IKEA = 'IKEA';

const ZONES = {
  ikea:  { label: 'IKEA',            filter: { 'supplier.company': IKEA } },
  home:  { label: 'HOME (без IKEA)', filter: { brand: 'matkasym-home',  'supplier.company': { $ne: IKEA } } },
  shaar: { label: 'SHAAR',           filter: { brand: 'matkasym-shaar', 'supplier.company': { $ne: IKEA } } },
};

// Зона товара: '' если товар ничьей зоне не принадлежит
function zoneOf(product) {
  if (product?.supplier?.company === IKEA) return 'ikea';
  if (product?.brand === 'matkasym-home')  return 'home';
  if (product?.brand === 'matkasym-shaar') return 'shaar';
  return '';
}

const zoneFilter = zone => ZONES[zone]?.filter || {};
const zoneLabel  = zone => ZONES[zone]?.label  || '';

module.exports = { ZONES, zoneOf, zoneFilter, zoneLabel, IKEA };
