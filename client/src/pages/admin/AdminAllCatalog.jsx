import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminGetProducts } from '../../api';
import AdminProductModal from './AdminProductModal';
import AdminProductCard from './AdminProductCard';
import AdminPdfButton from './AdminPdfButton';
import { useScrollRestore } from '../../hooks/useScrollRestore';
import { useLazyItems } from '../../hooks/useLazyItems';

const NO_PHOTO = '/logos/no-photo.png';

const CATEGORY_NAMES = {
  'ac-basket':              'Корзина для кондиционера',
  'ac-mount':               'Кронштейн для кондиционера',
  'antenna-indoor':         'Антенна комнатная',
  'antenna-outdoor':        'Антенна наружная',
  'bath-accessories':       'Аксессуары для ванной',
  'bath-mat':               'Коврик для ванной',
  'bbq-grill':              'Мангал / Гриль',
  'cleaning-set':           'Набор для уборки',
  'clothes-dryer':          'Сушилка для белья',
  'electric-panel-floor':   'Электропанель напольная',
  'electric-panel-gas':     'Электропанель газовая',
  'electric-panel-mount':   'Электропанель настенная',
  'electric-panel-outdoor': 'Электропанель уличная',
  'electric-panel-plumbing':'Электропанель сантехника',
  'floor-hanger':           'Напольная вешалка',
  'hanger-clip':            'Зажим для вешалки',
  'hook':                   'Крючок',
  'industrial-shelf':       'Стеллаж промышленный',
  'ironing-board':          'Гладильная доска',
  'ironing-board-ext':      'Гладильная доска с удлинителем',
  'ladder':                 'Лестница',
  'laundry-basket':         'Корзина для белья',
  'mirror-floor':           'Напольное зеркало',
  'mop':                    'Швабра',
  'organizer-kitchen':      'Органайзер кухонный',
  'other':                  'Другое',
  'school-desk':            'Парта школьная',
  'shelf-corner':           'Угловая полка',
  'shelf-flowers':          'Полка для цветов',
  'shelf-toilet':           'Полка для туалета',
  'shelf-washer':           'Полка для стиральной машины',
  'shoe-bench':             'Обувная полка с сидушкой',
  'shoe-rack':              'Обувная полка',
  'storage-cabinet':        'Шкаф для хранения',
  'storage-tumba':          'Тумба',
  'street-bench':           'Уличная скамейка',
  'street-light':           'Уличный фонарь',
  'toilet-brush':           'Ёршик для туалета',
  'tv-mount':               'Кронштейн для телевизора',
  'wall-hanger':            'Настенная вешалка',
  'wardrobe-rack':          'Гардеробная вешалка',
  'waste-bin':              'Мусорное ведро',
  'waste-bin-eco':          'Мусорное ведро эко',
  'waste-container':        'Мусорный контейнер',
  'Сушилка для белья':      'Сушилка для белья',
  'Гладильная доска':       'Гладильная доска',
  'Гладильная доска с удлинителем': 'Гладильная доска с удлинителем',
  'Костюмная вешалка':      'Костюмная вешалка',
  'Гардеробная вешалка':    'Гардеробная вешалка',
  'Настенная вешалка':      'Настенная вешалка',
  'Напольная вешалка':      'Напольная вешалка',
  'Обувная полка':          'Обувная полка',
  'Обувная полка с сидушкой': 'Обувная полка с сидушкой',
  'Полка для цветов':       'Полка для цветов',
  'Металлический стеллаж':  'Металлический стеллаж',
  'Напольное зеркало':      'Напольное зеркало',
  'Мангал':                 'Мангал',
  'Антенна наружная':       'Антенна наружная',
  'Антенна комнатная':      'Антенна комнатная',
  'Корзина для белья':      'Корзина для белья',
  'Плечики':                'Плечики',
  'Складная полка для гардеробной вешалки': 'Складная полка для гардеробной вешалки',
};

function catLabel(slug) {
  return CATEGORY_NAMES[slug] || slug;
}

const SET_NAMES = {
  'önügüü-set':      'Onuguu Set',
  'dayar-tütük':     'Dayar Tutuk',
  'achyk-asman':     'Achyk Asman',
  'den-sooluk':      'Den Sooluk',
  'zhashyl-ömür':    'Zhashyl Omur',
  'jenil-ashkana':   'Jenil Ashkana',
  'konok-keldi':     'Konok Keldi',
  'korkom-aiym':     'Korkom Aiym',
  'kosh-keliniz':    'Kosh Keliniz',
  'onoi-sakta':      'Onoi Sakta',
  'baary-oorunda':   'Baary Oorunda',
  'sanarip-tv':      'Sanarip TV',
  'shirin-balalyk':  'Shirin Balalyk',
  'taza-kiym':       'Taza Kiym',
  'uydo-ishtoo':     'Uydo Ishtoo',
  'mazza-seiyl':     'Mazza Seiyl',
  '0-tashtandy':     '0-Tashtandy',
  'bekem-fasad':     'Bekem Fasad',
  'bilim-kelechek':  'Bilim Kelechek',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'uzak-koldon':     'Uzak Koldon',
  'samples':         'Obraztsy',
  'small-batch':     'Malaya Partiya',
  'misc':            'Raznoe',
  'equipment':       'Oborudovanie',
  'other':           'Prochee',
};

const BRAND_META = {
  'matkasym-home':   { label: 'HOME',   accent: '#DC1E24' },
  'matkasym-shaar':  { label: 'SHAAR',  accent: '#3463A3' },
  'matkasym-kyzmat': { label: 'KYZMAT', accent: '#267846' },
};

const PRICE_MODES = [
  { key: 'retail',    label: 'Розн.' },
  { key: 'wholesale', label: 'Опт.'  },
  { key: 'dealer',    label: 'Дил.'  },
];

const STATUS_LABELS = {
  for_sale:       'В продаже',
  planned:        'В плане',
  in_development: 'В разработке',
  improvement:    'На улучшении',
  discontinued:   'Снят с производства',
  liquidation:    'Ликвидация',
};

function getPrice(p, mode) {
  if (mode === 'retail')    return p.price;
  if (mode === 'wholesale') return p.priceWholesale;
  if (mode === 'dealer')    return p.priceDealer;
  return null;
}

function setLabel(slug) {
  return SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const SEL = {
  padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none',
  color: '#333', fontWeight: 500,
};

export default function AdminAllCatalog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get('productStatus') || '';

  const [products,      setProducts]      = useState([]);
  const [detailProduct, setDetailProduct] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [priceMode, setPriceMode] = useState('retail');
  const [search,    setSearch]    = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('adminCatalogView') || 'grid');

  const toggleView = () => {
    const next = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(next);
    localStorage.setItem('adminCatalogView', next);
  };

  // Filters
  const [fBrand,    setFBrand]    = useState('');
  const [fSet,      setFSet]      = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fStock,    setFStock]    = useState(''); // '' | 'in' | 'out'
  const [fStatus,   setFStatus]   = useState(urlStatus);
  const [fPhoto,    setFPhoto]    = useState(''); // '' | 'no' | 'yes'
  const [sortStock, setSortStock] = useState('desc'); // '' | 'asc' | 'desc'
  const [sortNewest, setSortNewest] = useState(urlStatus === 'liquidation' ? 'newest' : ''); // '' | 'newest'

  const isLiquidation = fStatus === 'liquidation';

  useEffect(() => {
    adminGetProducts({ limit: 1000 })
      .then(r => setProducts(r.data.products || []))
      .finally(() => setLoading(false));
  }, []);

  // Cascading filter options
  const brands = useMemo(() =>
    [...new Set(products.map(p => p.brand).filter(Boolean))].sort(),
  [products]);

  const availableSets = useMemo(() => {
    const base = fBrand ? products.filter(p => p.brand === fBrand) : products;
    return [...new Set(base.map(p => p.set).filter(Boolean))]
      .sort((a, b) => (SET_NAMES[a] || a).localeCompare(SET_NAMES[b] || b, 'ru'));
  }, [products, fBrand]);

  const availableCategories = useMemo(() => {
    let base = products;
    if (fBrand) base = base.filter(p => p.brand === fBrand);
    if (fSet)   base = base.filter(p => p.set === fSet);
    return [...new Set(base.map(p => p.category).filter(Boolean))]
      .sort((a, b) => catLabel(a).localeCompare(catLabel(b), 'ru'));
  }, [products, fBrand, fSet]);

  const statuses = useMemo(() =>
    [...new Set(products.map(p => p.productStatus).filter(Boolean))].sort(),
  [products]);

  const activeFilters = [fBrand, fSet, fCategory, fStock, fStatus, fPhoto, sortStock].filter(Boolean).length;

  const hasPhoto = p => p.images && p.images.length > 0 && p.images[0] && !p.images[0].includes('no-photo');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products;
    if (q)        list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.fullName || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
    if (fBrand)   list = list.filter(p => p.brand === fBrand);
    if (fSet)     list = list.filter(p => p.set === fSet);
    if (fCategory)list = list.filter(p => p.category === fCategory);
    if (fStock === 'in')  list = list.filter(p => p.inStock || p.stock > 0);
    if (fStock === 'out') list = list.filter(p => !p.inStock && !(p.stock > 0));
    if (fStatus)  list = list.filter(p => p.productStatus === fStatus);
    if (fPhoto === 'no')  list = list.filter(p => !hasPhoto(p));
    if (fPhoto === 'yes') list = list.filter(p => hasPhoto(p));
    // Сортировка
    if (sortNewest === 'newest') {
      // Для ликвидаций сортируем по liquidatedAt, затем по updatedAt
      list = [...list].sort((a, b) => {
        const aDate = a.liquidatedAt || a.updatedAt || a.createdAt;
        const bDate = b.liquidatedAt || b.updatedAt || b.createdAt;
        return new Date(bDate) - new Date(aDate);
      });
    } else if (sortStock === 'asc') {
      list = [...list].sort((a, b) => (a.stock || 0) - (b.stock || 0));
    } else if (sortStock === 'desc') {
      list = [...list].sort((a, b) => (b.stock || 0) - (a.stock || 0));
    }
    return list;
  }, [products, search, fBrand, fSet, fCategory, fStock, fStatus, fPhoto, sortStock, sortNewest]);

  // Разделение на товары в наличии и без
  const { inStockFiltered, outOfStockFiltered } = useMemo(() => {
    const inStock = [];
    const outOfStock = [];
    filtered.forEach(p => {
      const hasStock = p.stock > 0 || p.inStock;
      if (hasStock) {
        inStock.push(p);
      } else {
        outOfStock.push(p);
      }
    });
    return { inStockFiltered: inStock, outOfStockFiltered: outOfStock };
  }, [filtered]);

  // Group by brand → set (no brand → HOME)
  const { tree } = useMemo(() => {
    const tree = {};
    inStockFiltered.forEach(p => {
      const brand = p.brand || 'matkasym-home';
      const set   = p.set   || 'other';
      if (!tree[brand]) tree[brand] = {};
      if (!tree[brand][set]) tree[brand][set] = [];
      tree[brand][set].push(p);
    });
    return { tree };
  }, [inStockFiltered]);

  const brandOrder = ['matkasym-home', 'matkasym-shaar', 'matkasym-kyzmat'];

  // Flatten tree into sections for lazy rendering
  const sections = useMemo(() => {
    const result = [];
    brandOrder.forEach(brandKey => {
      const sets = tree[brandKey];
      if (!sets) return;
      Object.entries(sets).sort(([a], [b]) => a.localeCompare(b)).forEach(([setSlug, prods]) => {
        result.push({ brandKey, setSlug, prods });
      });
    });
    return result;
  }, [tree]);

  const { visible: visibleSections, sentinelRef, hasMore } = useLazyItems(sections, 8);

  useScrollRestore(loading);

  const resetFilters = () => { setFBrand(''); setFSet(''); setFCategory(''); setFStock(''); setFStatus(''); setFPhoto(''); setSortStock(''); setSearch(''); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f7f8fa', paddingBottom: 12, marginBottom: 4, borderBottom: '1px solid #eee' }}>
        {/* Row 1: title + price + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 4 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}>←</button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: isLiquidation ? '#92400e' : '#111' }}>
              {isLiquidation ? '🏷️ Ликвидированные товары' : '📦 Все товары'}
            </div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
              {loading ? '…' : `${filtered.length} из ${products.length} товаров`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {PRICE_MODES.map(m => (
              <button key={m.key} onClick={() => setPriceMode(m.key)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 12,
                background: priceMode === m.key ? '#222' : '#f0f0f0',
                color:      priceMode === m.key ? '#fff' : '#888',
              }}>{m.label}</button>
            ))}
          </div>
          <AdminPdfButton
            products={filtered}
            label={fSet ? setLabel(fSet) : fBrand ? (BRAND_META[fBrand]?.label || fBrand) : 'Все товары'}
          />
          <button onClick={toggleView} title={viewMode === 'grid' ? 'Список' : 'Сетка'} style={{
            padding: '5px 10px', borderRadius: 6, border: '1.5px solid #e0e0e0',
            background: '#fff', cursor: 'pointer', fontSize: 16, color: '#555', lineHeight: 1,
          }}>
            {viewMode === 'grid' ? '☰' : '⊞'}
          </button>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск…"
            style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, width: 180, outline: 'none', background: '#fff' }}
          />
        </div>

        {/* Row 2: filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
          <select value={fBrand} onChange={e => { setFBrand(e.target.value); setFSet(''); setFCategory(''); }} style={SEL}>
            <option value="">Все бренды</option>
            {brands.map(b => <option key={b} value={b}>{BRAND_META[b]?.label || b}</option>)}
          </select>

          <select value={fSet} onChange={e => { setFSet(e.target.value); setFCategory(''); }} style={SEL}>
            <option value="">Все сеты</option>
            {availableSets.map(s => <option key={s} value={s}>{setLabel(s)}</option>)}
          </select>

          <select value={fCategory} onChange={e => setFCategory(e.target.value)} style={SEL}>
            <option value="">Все категории</option>
            {availableCategories.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
          </select>

          {!isLiquidation && (
            <select value={fStock} onChange={e => setFStock(e.target.value)} style={SEL}>
              <option value="">Любой склад</option>
              <option value="in">В наличии</option>
              <option value="out">Нет в наличии</option>
            </select>
          )}

          <select value={fStatus} onChange={e => { setFStatus(e.target.value); if (e.target.value === 'liquidation') setSortNewest('newest'); else setSortNewest(''); }} style={SEL}>
            <option value="">Все статусы</option>
            {statuses.map(s => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
          </select>

          <select value={fPhoto} onChange={e => setFPhoto(e.target.value)} style={SEL}>
            <option value="">Любое фото</option>
            <option value="no">📷 Без фото</option>
            <option value="yes">✅ С фото</option>
          </select>

          {isLiquidation ? (
            <select value={sortNewest} onChange={e => setSortNewest(e.target.value)} style={SEL}>
              <option value="newest">🆕 Новые ликвидации</option>
              <option value="">По умолчанию</option>
            </select>
          ) : (
            <select value={sortStock} onChange={e => setSortStock(e.target.value)} style={SEL}>
              <option value="">Сортировка склада</option>
              <option value="desc">Склад: много → мало</option>
              <option value="asc">Склад: мало → много</option>
            </select>
          )}

          {activeFilters > 0 && (
            <button onClick={resetFilters} style={{
              padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: '#fee', color: '#c00', fontSize: 12, fontWeight: 700,
            }}>
              ✕ Сбросить ({activeFilters})
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Ничего не найдено</div>
      ) : sortNewest === 'newest' ? (
        /* Группировка по датам ликвидации */
        <div style={{ paddingBottom: 40 }}>
          {(() => {
            const byDate = {};
            filtered.forEach(p => {
              const d = p.liquidatedAt ? new Date(p.liquidatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Без даты';
              if (!byDate[d]) byDate[d] = [];
              byDate[d].push(p);
            });
            const sortedDates = Object.keys(byDate).sort((a, b) => {
              if (a === 'Без даты') return 1;
              if (b === 'Без даты') return -1;
              const parseDate = (s) => { const [d, m, y] = s.split(' '); return new Date(`${m} ${d}, ${y}`); };
              return parseDate(b) - parseDate(a);
            });
            return sortedDates.map((dateStr, idx) => (
              <div key={dateStr} style={{ marginBottom: 28 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: idx === 0 ? 0 : 28,
                  borderLeft: '4px solid #92400e', paddingLeft: 12
                }}>
                  <span style={{ fontWeight: 900, fontSize: 14, color: '#92400e' }}>{dateStr}</span>
                  <span style={{ fontSize: 12, color: '#aaa' }}>{byDate[dateStr].length} тов.</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
                  {byDate[dateStr].map(p => (
                    <AdminProductCard key={p._id} product={p} priceMode={priceMode} accent="#92400e" onOpen={setDetailProduct} viewMode="grid" />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : (
        <div style={{ paddingBottom: 40 }}>
          {visibleSections.map(({ brandKey, setSlug, prods }, idx) => {
            const accent  = BRAND_META[brandKey]?.accent || '#555';
            const isFirst = idx === 0 || visibleSections[idx - 1].brandKey !== brandKey;
            const grouped = {};
            prods.forEach(p => { const k = p.name || p._id; if (!grouped[k]) grouped[k] = []; grouped[k].push(p); });
            return (
              <div key={`${brandKey}_${setSlug}`}>
                {isFirst && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: idx === 0 ? 0 : 28, borderLeft: `4px solid ${accent}`, paddingLeft: 12 }}>
                    <span style={{ fontWeight: 900, fontSize: 16, color: accent, letterSpacing: 1 }}>
                      {BRAND_META[brandKey]?.label || brandKey.toUpperCase()}
                    </span>
                  </div>
                )}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{setLabel(setSlug)}</span>
                    <span style={{ fontWeight: 400, fontSize: 11, color: '#aaa' }}>{prods.length} тов.</span>
                  </div>
                  {viewMode === 'list' ? (
                    <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
                      {Object.entries(grouped).map(([name, variants]) => (
                        <AdminProductCard key={name} product={variants[0]} priceMode={priceMode} accent={accent} onOpen={setDetailProduct} viewMode="list" />
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
                      {Object.entries(grouped).map(([name, variants]) => (
                        <AdminProductCard key={name} product={variants[0]} priceMode={priceMode} accent={accent} onOpen={setDetailProduct} viewMode="grid" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {hasMore && <div ref={sentinelRef} style={{ height: 40 }} />}

          {/* Секция "Нет в наличии" */}
          {outOfStockFiltered.length > 0 && (
            <>
              <div style={{
                marginTop: 32,
                marginBottom: 16,
                paddingBottom: 8,
                borderBottom: '2px solid #e0e0e0',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  НЕТ В НАЛИЧИИ
                </span>
                <span style={{ fontSize: 12, color: '#bbb' }}>{outOfStockFiltered.length} тов.</span>
              </div>
              <div style={{
                display: viewMode === 'grid' ? 'grid' : 'flex',
                gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(170px, 1fr))' : undefined,
                flexDirection: viewMode === 'list' ? 'column' : undefined,
                gap: 12,
                opacity: 0.7,
              }}>
                {outOfStockFiltered.map(p => (
                  <AdminProductCard key={p._id} product={p} priceMode={priceMode} accent="#888" onOpen={setDetailProduct} viewMode={viewMode} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {detailProduct && (
        <AdminProductModal product={detailProduct} onClose={() => setDetailProduct(null)}
          onDeleted={id => { setProducts(p => p.filter(x => x._id !== id)); setDetailProduct(null); }} />
      )}
    </div>
  );
}
