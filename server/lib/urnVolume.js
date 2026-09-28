/**
 * Объём урны или бака — для плашки на фото в каталоге сетов.
 *
 * Объём в базе записан как попало:
 *   · характеристикой «Объём» — Tazalyk «1100», пластиковые баки «120»;
 *   · у сортировочных — объёмом одной секции и числом секций (G3: 3 × 45 л),
 *     а покупателю нужен общий: 135 л;
 *   · только в названии — «TEGEREK 35 л», «Каракол G3 135 л», «Tazalyk 660 L».
 *
 * Список сета приходит с brief=1, и в нём только две первые характеристики —
 * «Вместимость отделения» у G3 стоит восьмой. Поэтому считаем здесь, по полным
 * specs, и отдаём готовой строкой в поле volume.
 */
const Product = require('../models/Product');

// Урны и баки: по категории, а у заведённых без неё — по названию.
// «урн» — только с начала слова: иначе сюда попадают «Журнальные столики».
const URN_CATEGORY = /(?<![а-яё])(урн|бак|ведр)|waste-bin/i;
const URN_NAME     = /(?<![а-яё])(урн|бак(?![а-яё])|ведро)|tazalyk/i;   // \b после кириллицы в JS не работает
const NOT_URN      = /крышк|накладк|пепельниц/i;   // детали к урнам

const num = s => {
  const m = String(s ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
};
const specOf = (specs, re) => (specs || []).find(s => re.test(s.key || '') && String(s.value || '').trim());
const fmt = l => `${Math.round(l * 10) / 10} л`.replace('.', ',');

function isUrn(p) {
  const name = p.fullName || p.name || '';
  return !NOT_URN.test(name) && (URN_CATEGORY.test(p.category || '') || URN_NAME.test(name));
}

function volumeOf(p) {
  const specs = p.specs || [];

  // Сортировочная: секции × объём секции — это и есть общий объём
  const perSection = num(specOf(specs, /вместимость (отделения|секции)|объ[её]м (отделения|секции)/i)?.value);
  const sections   = num(specOf(specs, /кол-во (отделений|секций)|количество (отделений|секций)/i)?.value);
  if (perSection && sections) return fmt(perSection * sections);

  const total = num(specOf(specs, /^объ[её]м$/i)?.value);
  if (total) return fmt(total);

  // «35 л», «12лт», «660 L», «1100л» — в названии
  const m = (p.fullName || p.name || '').match(/(\d+(?:[.,]\d+)?)\s*(?:литр|лт|л|l)(?![а-яёa-z])/i);
  if (m) return fmt(num(m[1]));

  if (perSection) return `${fmt(perSection)} × секц.`;
  return '';
}

/**
 * Проставляет volume урнам в списке (lean-объекты из brief-выборки). Полные specs
 * добирает одним запросом только для урн — остальным товарам лишний вес ни к чему.
 */
async function attachUrnVolume(products) {
  const urns = products.filter(isUrn);
  if (!urns.length) return;
  const full = await Product.find({ _id: { $in: urns.map(p => p._id) } }, 'specs').lean();
  const specsById = new Map(full.map(d => [String(d._id), d.specs]));
  urns.forEach(p => {
    const v = volumeOf({ ...p, specs: specsById.get(String(p._id)) || p.specs });
    if (v) p.volume = v;
  });
}

module.exports = { attachUrnVolume, volumeOf, isUrn };
