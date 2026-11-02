import { categoryRank } from '../../config/setCategoryOrder';

// Порядок в каталоге целиком: сет → категория → карточка, как они стоят на
// экране. Сеты идут в порядке линеек бренда, категории и карточки внутри сета —
// по расстановке из SetLayout (её правят кнопкой «Порядок» в панели сета).
// Чего в расстановке нет — по алфавиту категории и как отдала база внутри.
//
// Раньше внутри сета товары шли подряд как пришли с сервера, то есть по остатку:
// горшки, мангал, коврик — вперемешку. По такому PDF каталог не листают.
function orderInSet(products, setSlug, layout) {
  const saved = layout?.categories || [];
  const cats = new Map();
  products.forEach(p => {
    const cat = p.category || 'Прочее';
    if (!cats.has(cat)) cats.set(cat, []);
    cats.get(cat).push(p);
  });
  return [...cats.entries()]
    .sort((a, b) => categoryRank(setSlug, a[0], saved) - categoryRank(setSlug, b[0], saved)
                 || a[0].localeCompare(b[0], 'ru'))
    .flatMap(([cat, items]) => {
      const names = layout?.products?.[cat] || [];
      const rank = new Map(names.map((n, i) => [n, i]));
      return [...items].sort((x, y) => (rank.has(x.name) ? rank.get(x.name) : 999)
                                     - (rank.has(y.name) ? rank.get(y.name) : 999));
    });
}

// Группы для печати. Общий модуль кнопки «PDF» и сборщика готовых файлов (build-generated-catalog.js):
// файл на кнопке должен совпадать с тем, что соберёт сам браузер.
// withRest — сеты, которых нет в линейках бренда, и товары без сета: в конец.
export function brandPdfGroups(products, sets, layouts, { withRest = true } = {}) {
  // Свой порядок для печати (pdfOrder у сетов), если задан; иначе — как на экране
  const hasPdfOrder = sets.some(s => Number.isFinite(s.pdfOrder));
  const setOrder = (hasPdfOrder
    ? sets.map((s, i) => ({ s, i })).sort((a, b) =>
        (Number.isFinite(a.s.pdfOrder) ? a.s.pdfOrder : 1e6 + a.i) - (Number.isFinite(b.s.pdfOrder) ? b.s.pdfOrder : 1e6 + b.i)).map(x => x.s)
    : sets).map(s => s.key);
  const setLabels = {};
  sets.forEach(s => { setLabels[s.key] = s.label || s.key; });

  const grouped = {};
  products.forEach(p => {
    const setKey = p.set || '_other';
    if (!grouped[setKey]) grouped[setKey] = [];
    grouped[setKey].push(p);
  });

  const pdfGroups = [];
  const pushSet = setKey => {
    if (!grouped[setKey]?.length) return;
    pdfGroups.push({
      setKey,
      groupName: setLabels[setKey] || setKey,
      products: orderInSet(grouped[setKey], setKey, layouts[setKey]),
    });
  };
  setOrder.forEach(pushSet);
  if (withRest) Object.keys(grouped).filter(k => !setOrder.includes(k)).sort().forEach(pushSet);
  return pdfGroups;
}
