import { useState, useRef, useEffect } from 'react';
import { adminGetProducts, adminGetSetLayouts } from '../../api/index';
import { printCatalog, fitsCatalog } from './catalogPrint';
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

// priceMode — когда кнопку ставят в панель каталога, цену там уже выбирают
// своим переключателем; свой прятаем, чтобы их не было два.
const PRICE_MODE_TO_TYPE = { retail: 'price', wholesale: 'priceWholesale', dealer: 'priceDealer', none: 'none' };

export default function BrandPdfButton({ brandKey, sets = [], brandLabel = 'Каталог', currency = 'сом', priceMode }) {
  const [loading,   setLoading]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [ownType,   setPriceType] = useState('price');
  const priceType = priceMode ? (PRICE_MODE_TO_TYPE[priceMode] || 'price') : ownType;
  const timerRef = useRef(null);

  // Каталог под встречу: не весь бренд, а отмеченные сеты — например, для
  // строительной компании щиты, фасад, урны и скамейки. null — отмечены все.
  const [picked, setPicked] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);
  const isPicked = key => !picked || picked.has(key);
  const pickedCount = sets.filter(s => isPicked(s.key)).length;

  useEffect(() => {
    if (!pickerOpen) return;
    const close = e => { if (!pickerRef.current?.contains(e.target)) setPickerOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pickerOpen]);

  const togglePick = key => {
    const next = new Set(sets.filter(s => isPicked(s.key)).map(s => s.key));
    if (next.has(key)) next.delete(key); else next.add(key);
    setPicked(next.size === sets.length ? null : next);
  };

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setProgress(5);

    timerRef.current = setInterval(() => {
      setProgress(p => p < 88 ? p + (88 - p) * 0.08 : p);
    }, 300);

    try {
      // brief=1 — иначе сервер отдаёт полные документы со всеми деталями
      // комплектов на девятьсот позиций, и запрос на Render (512 МБ) просто
      // не доезжает: прогресс доходил до 80% и вываливалась «Ошибка при
      // создании PDF». Каталогу из товара нужны только фото, цена, габариты и
      // пара характеристик — ровно то, что в brief.
      const [res, layoutRes] = await Promise.all([
        adminGetProducts({ brand: brandKey, brief: 1, limit: 5000 }),
        adminGetSetLayouts(brandKey).catch(() => ({ data: { layouts: {} } })),
      ]);
      const allProducts = res.data.products || [];
      const layouts = layoutRes.data?.layouts || {};

      const availableProducts = allProducts.filter(fitsCatalog)
        .filter(p => !picked || picked.has(p.set));

      if (picked && picked.size === 0) {
        alert('Не выбран ни один сет');
        clearInterval(timerRef.current);
        setLoading(false);
        setProgress(0);
        return;
      }

      if (availableProducts.length === 0) {
        alert('Нечего выгружать: в каталог идут товары с остатком, детали комплектов в него не входят');
        clearInterval(timerRef.current);
        setLoading(false);
        setProgress(0);
        return;
      }

      const setOrder = sets.map(s => s.key);
      const setLabels = {};
      sets.forEach(s => { setLabels[s.key] = s.label || s.key; });

      const grouped = {};
      availableProducts.forEach(p => {
        const setKey = p.set || '_other';
        if (!grouped[setKey]) grouped[setKey] = [];
        grouped[setKey].push(p);
      });

      const pdfGroups = [];

      const pushSet = (setKey) => {
        if (!grouped[setKey]?.length) return;
        pdfGroups.push({
          groupName: setLabels[setKey] || setKey,
          products: orderInSet(grouped[setKey], setKey, layouts[setKey]),
        });
      };

      setOrder.forEach(pushSet);
      // Сеты, которых нет в линейках бренда (и товары вовсе без сета) — в конец:
      // прятать их нельзя, а место в чужом ряду им выдумывать незачем.
      // При выборе сетов вручную хвоста нет — в каталог идёт ровно отмеченное.
      if (!picked) Object.keys(grouped).filter(k => !setOrder.includes(k)).sort().forEach(pushSet);

      if (pdfGroups.length === 0) {
        alert('Нет товаров для выгрузки');
        clearInterval(timerRef.current);
        setLoading(false);
        setProgress(0);
        return;
      }

      const brand = brandKey === 'matkasym-kyzmat' ? 'kyzmat'
                  : brandKey === 'matkasym-shaar' ? 'shaar' : 'home';

      await printCatalog(pdfGroups, brandLabel, priceType, brand, currency);

      clearInterval(timerRef.current);
      setProgress(100);
    } catch (e) {
      console.error('Brand PDF error:', e);
      alert('Ошибка при создании PDF');
      clearInterval(timerRef.current);
    } finally {
      setTimeout(() => { setLoading(false); setProgress(0); }, 600);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {!priceMode && (
      <select
        value={ownType}
        onChange={e => setPriceType(e.target.value)}
        disabled={loading}
        style={{ padding: '5px 8px', borderRadius: 6, border: '1.5px solid #e0e0e0',
          fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none' }}
      >
        <option value="price">Розничная</option>
        <option value="priceWholesale">Оптовая</option>
        <option value="priceDealer">Дилерская</option>
        <option value="none">Без цены</option>
      </select>
      )}

      {sets.length > 1 && (
        <div ref={pickerRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setPickerOpen(v => !v)}
            disabled={loading}
            title="Какие сеты положить в каталог"
            style={{ padding: '5px 10px', borderRadius: 6, border: '1.5px solid #e0e0e0',
              background: picked ? '#eef4ff' : '#fff', color: picked ? '#1a73e8' : '#333',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {picked ? `Сеты: ${pickedCount} из ${sets.length}` : 'Все сеты'} ▾
          </button>
          {pickerOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
              background: '#fff', border: '1px solid #e3e6ea', borderRadius: 10,
              boxShadow: '0 10px 30px rgba(0,0,0,.14)', padding: 8, minWidth: 240,
              maxHeight: 360, overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 6, padding: '2px 4px 8px', borderBottom: '1px solid #f0f0f0', marginBottom: 4 }}>
                <button type="button" onClick={() => setPicked(null)}
                  style={{ flex: 1, padding: '4px 0', fontSize: 11.5, border: '1px solid #e0e0e0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
                  Все
                </button>
                <button type="button" onClick={() => setPicked(new Set())}
                  style={{ flex: 1, padding: '4px 0', fontSize: 11.5, border: '1px solid #e0e0e0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
                  Снять все
                </button>
              </div>
              {sets.map(s => (
                <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px',
                  borderRadius: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={isPicked(s.key)} onChange={() => togglePick(s.key)} />
                  {s.label || s.key}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleClick}
        disabled={loading}
        title="Откроет каталог и диалог печати — там «Сохранить как PDF»"
        style={{
          position: 'relative', overflow: 'hidden',
          padding: '5px 14px', borderRadius: 6, border: 'none',
          cursor: loading ? 'wait' : 'pointer',
          background: '#1a73e8', color: '#fff',
          fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', minWidth: 90,
        }}
      >
        {loading && (
          <span style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(255,255,255,0.22)',
            width: `${progress}%`,
            transition: 'width 0.25s ease',
            borderRadius: 6,
          }} />
        )}
        <span style={{ position: 'relative', zIndex: 1 }}>
          {loading ? `⏳ ${Math.round(progress)}%` : '📄 PDF'}
        </span>
      </button>
    </div>
  );
}
