import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { adminGetProduct } from '../../api/index';
import { adminGetProducts, adminDeleteProduct, adminGetFacets } from '../../api/index';
import { downloadCatalogPDF } from './CatalogPDF';
import { cloudinaryOpt } from '../../utils/drive';
import { CATEGORIES } from '../../config/categorySpecs';
import { useAuth } from '../../context/AuthContext';
import { CRM_STAGES } from './AdminProductForm';

const BRANDS = [
  { value: '', label: 'Все бренды' },
  { value: 'matkasym-home',  label: 'HOME' },
  { value: 'matkasym-shaar', label: 'SHAAR' },
];

const SET_LABELS_RU = {
  'nelikvid':    'Неликвид',
  'samples':     'Образцы',
  'small-batch': 'Малосерийные',
  'misc':        'Разное',
  'equipment':   'Оборудование и сырьё',
  'other':       'Прочее',
  'achyk-asman': 'ACHYK ASMAN',
  'den-sooluk':  'DEN SOOLUK',
  'green-omir':  'GREEN OMIR',
  'kosh-keliniz':'KOSH KELINIZ',
  'sanarip-tv':  'SANARIP TV',
  'taza-kiym':   'TAZA KIYM',
  'jenil-ashkana':'JENIL ASHKANA',
  'onoi-sakta':  'ONOI SAKTA',
  'turak-jai':   'TURAK JAI',
  'bilim-kelechek':'BILIM KELECHEK',
  'uzak-koldon': 'UZAK KOLDON',
  'bekem-fasad':    'BEKEM FASAD',
  '0-tashtandy':    '0 TASHTANDY',
  'konok-keldi':    'KONOK KELDI',
  'korkom-aiym':    'KORKOM AIYM',
  'shirin-balalyk': 'SHIRIN BALALYK',
  'uydo-ishtoo':    'UYDO ISHTOO',
};

const STOCK_OPTIONS = [
  { value: '',      label: 'Любой статус' },
  { value: 'true',  label: 'В наличии' },
  { value: 'false', label: 'Нет в наличии' },
];

const PRODUCT_STATUS_OPTIONS = [
  { value: '',              label: 'Все статусы' },
  { value: 'for_sale',      label: '🛒 В продаже' },
  { value: 'planned',       label: '📋 В плане' },
  { value: 'in_development',label: '🔨 В разработке' },
  { value: 'improvement',   label: '🔧 На улучшении' },
  { value: 'discontinued',  label: '🚫 Снят с производства' },
];

const PRODUCT_STATUS_META = {
  for_sale:       { label: 'В продаже',           color: '#2d7a3a' },
  planned:        { label: 'В плане',             color: '#3b5bdb' },
  in_development: { label: 'В разработке',        color: '#7c3aed' },
  improvement:    { label: 'На улучшении',        color: '#c47a00' },
  discontinued:   { label: 'Снят с производства', color: '#888'    },
};

const STOCK_STATUS_OPTIONS = [
  { value: '',             label: 'Любой склад' },
  { value: 'in_stock',     label: '✅ В наличии' },
  { value: 'out_of_stock', label: '❌ Нет в наличии' },
  { value: 'expected',     label: '🕐 Ожидается' },
];

const STOCK_STATUS_META = {
  in_stock:     { label: 'В наличии',     color: '#2d7a3a' },
  out_of_stock: { label: 'Нет в наличии', color: '#c0392b' },
  expected:     { label: 'Ожидается',     color: '#c47a00' },
};

const COLOR_SWATCHES = {
  white:  '#f0f0f0',
  black:  '#222',
  grey:   '#999',
  gray:   '#999',
  brown:  '#8B6914',
  beige:  '#d4b896',
  red:    '#e10523',
  blue:   '#1a6fb5',
  green:  '#2d7a3a',
  gold:   '#c8a500',
  silver: '#aaa',
};

// Strip trailing color annotation from name, e.g. "Lion 4 (чёрный)" → "Lion 4"
const COLOR_SUFFIX_RE = /\s*\((бел[ыьа][йяе]?|чёрн[ыьа][йяе]?|сер[ыьа][йяе]?|коричнев[ыьа][йяе]?|бежев[ыьа][йяе]?|красн[ыьа][йяе]?|синий|синяя|зелён[ыьа][йяе]?|золот[ыьа][йяе]?|серебрист[ыьа][йяе]?|white|black|grey|gray|brown|beige|red|blue|green|gold|silver)\)\s*$/i;
function cleanName(name = '') { return name.replace(COLOR_SUFFIX_RE, '').trim(); }

function thumb(p) {
  if (p.images?.[0]) {
    return p.images[0].includes('cloudinary.com')
      ? cloudinaryOpt(p.images[0], 80)
      : p.images[0];
  }
  return null;
}

function categoryLabel(value) {
  return CATEGORIES.find(c => c.value === value)?.label || value || '—';
}

export default function AdminProducts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'editor';

  // ── Filters stored in URL so they survive navigation ──────────────────────
  const [searchParams, setSearchParams] = useSearchParams();

  // Restore filters from sessionStorage if URL has no params (e.g. after coming back from edit)
  useEffect(() => {
    if (!window.location.search) {
      const saved = sessionStorage.getItem('adminProductsFilters');
      if (saved) setSearchParams(new URLSearchParams(saved), { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save filters to sessionStorage on every change
  useEffect(() => {
    sessionStorage.setItem('adminProductsFilters', searchParams.toString());
  }, [searchParams]);

  const search        = searchParams.get('q')      || '';
  const brand         = searchParams.get('brand')  || '';
  const set           = searchParams.get('set')    || '';
  const category      = searchParams.get('cat')    || '';
  const productStatus = searchParams.get('status') || '';
  const stockFilter   = searchParams.get('stock')  || '';
  const stockSort     = searchParams.get('sort')   || '';
  const groupBySet    = searchParams.get('group')  !== '0';
  const page          = Number(searchParams.get('page')) || 1;

  // Update one or more params at once, keeps the rest intact
  const upd = useCallback((patch) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== null && v !== false)
          next.set(k, String(v));
        else
          next.delete(k);
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Setters — cascade resets happen inline, no separate useEffects needed
  const setSearch        = v => upd({ q: v, page: '' });
  const setBrand         = v => upd({ brand: v, set: '', cat: '', page: '' });
  const setSet           = v => upd({ set: v, cat: '', page: '' });
  const setCategory      = v => upd({ cat: v, page: '' });
  const setProductStatus = v => upd({ status: v, page: '' });
  const setStockFilter   = v => upd({ stock: v });
  const setStockSort     = v => upd({ sort: v });
  const setGroupBySet    = v => upd({ group: v ? '' : '0' });
  const setPage          = v => upd({ page: v === 1 ? '' : String(v) });

  // Data
  const [products, setProducts] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [pages,    setPages]    = useState(1);
  const [loading,  setLoading]  = useState(false);

  // Available options from facets (dependent on other filters)
  const [availSets, setAvailSets]   = useState([]);  // set keys from DB
  const [availCats, setAvailCats]   = useState([]);  // category keys from DB

  // Load facets whenever brand/set/category/search changes
  useEffect(() => {
    const params = {};
    if (brand)    params.brand    = brand;
    if (set)      params.set      = set;
    if (category) params.category = category;
    if (search)   params.search   = search;
    adminGetFacets(params)
      .then(r => {
        setAvailSets(r.data.sets);
        setAvailCats(r.data.categories);
      })
      .catch(() => {});
  }, [brand, set, category, search]);

  // Load products
  const load = useCallback(() => {
    setLoading(true);
    adminGetProducts({
      page, limit: 500, search,
      brand:         brand         || undefined,
      set:           set           || undefined,
      category:      category      || undefined,
      productStatus: productStatus || undefined,
    })
      .then(r => {
        setProducts(r.data.products);
        setTotal(r.data.total);
        setPages(r.data.pages);
      })
      .finally(() => setLoading(false));
  }, [page, search, brand, set, category, productStatus]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Удалить «${name}»?`)) return;
    await adminDeleteProduct(id);
    load();
  };

  const handleDuplicate = async (id) => {
    const r = await adminGetProduct(id);
    const p = r.data;
    navigate('/admin/products/new', {
      state: {
        duplicate: {
          ...p,
          _id: undefined,
          sku: '',
          color: '',
          images: [],
        },
      },
    });
  };

  // Group: set → model (cleanName+category) → [variants]
  const grouped = useMemo(() => {
    const mk = (p) => `${cleanName(p.name)}__${p.category || ''}`;

    const passStock = (variants) => {
      if (!stockFilter) return true;
      const total = variants.reduce((s, v) => s + (v.stock || 0), 0);
      return stockFilter === 'in' ? total > 0 : total === 0;
    };

    if (groupBySet) {
      const acc = {};
      products.forEach(p => {
        const sk = p.set || '__none__';
        if (!acc[sk]) acc[sk] = {};
        const key = mk(p);
        if (!acc[sk][key]) acc[sk][key] = [];
        acc[sk][key].push(p);
      });
      // Apply stock filter
      Object.keys(acc).forEach(sk => {
        Object.keys(acc[sk]).forEach(key => {
          if (!passStock(acc[sk][key])) delete acc[sk][key];
        });
        if (Object.keys(acc[sk]).length === 0) delete acc[sk];
      });
      return acc;
    }
    const acc = {};
    products.forEach(p => {
      const key = mk(p);
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
    });
    Object.keys(acc).forEach(key => {
      if (!passStock(acc[key])) delete acc[key];
    });
    return { __all__: acc };
  }, [products, groupBySet, stockFilter]);

  const groupKeys = useMemo(() =>
    Object.keys(grouped).sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      if (a === '__all__')  return 0;
      return a.localeCompare(b);
    })
  , [grouped]);

  // Sort model keys within each group by total stock
  const sortedModelKeys = useCallback((models) => {
    const keys = Object.keys(models);
    if (!stockSort) return keys;
    return keys.sort((a, b) => {
      const ta = models[a].reduce((s, v) => s + (v.stock || 0), 0);
      const tb = models[b].reduce((s, v) => s + (v.stock || 0), 0);
      return stockSort === 'asc' ? ta - tb : tb - ta;
    });
  }, [stockSort]);

  // Unique model count across current page
  const uniqueModelCount = useMemo(() =>
    groupKeys.reduce((sum, gk) => sum + Object.keys(grouped[gk]).length, 0)
  , [grouped, groupKeys]);

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">
          Товары{' '}
          <span style={{ color: 'var(--slate)', fontWeight: 500, fontSize: 18 }}>{uniqueModelCount}</span>
          {uniqueModelCount !== total && (
            <span style={{ color: 'var(--slate)', fontWeight: 400, fontSize: 13, marginLeft: 6 }}>({total} вариантов)</span>
          )}
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {set && (
            <button
              className="btn btn-sm"
              style={{ background: '#1a73e8', color: '#fff', border: 'none' }}
              onClick={async () => {
                const setLabel = set.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                await downloadCatalogPDF(products, setLabel);
              }}
            >
              📄 Скачать PDF
            </button>
          )}
          {canEdit && <Link to="/admin/products/new" className="btn btn-primary btn-sm">+ Добавить</Link>}
        </div>
      </div>

      <div className="admin-table-wrap">

        {/* ── Filters ── */}
        <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            className="admin-search"
            placeholder="Поиск по названию, SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {/* Brand */}
          <select className="admin-select" value={brand} onChange={e => setBrand(e.target.value)}>
            {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>

          {/* Set — shows only sets that exist in DB for current brand */}
          <select
            className="admin-select"
            value={set}
            onChange={e => setSet(e.target.value)}
            disabled={availSets.length === 0}
          >
            <option value="">Все сеты</option>
            {availSets.map(s => (
              <option key={s} value={s}>{SET_LABELS_RU[s] || s.toUpperCase().replace(/-/g, ' ')}</option>
            ))}
          </select>

          {/* Category — shows only categories that exist in current brand+set */}
          <select
            className="admin-select"
            value={category}
            onChange={e => setCategory(e.target.value)}
            disabled={availCats.length === 0}
          >
            <option value="">Все категории</option>
            {availCats.map(c => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>

          {/* Stock filter by quantity */}
          <select className="admin-select" value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
            <option value="">Любой склад</option>
            <option value="in">✅ В наличии</option>
            <option value="out">❌ Нет в наличии</option>
          </select>

          {/* Stock sort */}
          <select className="admin-select" value={stockSort} onChange={e => setStockSort(e.target.value)}>
            <option value="">Сортировка склада</option>
            <option value="desc">↓ По убыванию</option>
            <option value="asc">↑ По возрастанию</option>
          </select>

          {/* Product status */}
          <select className="admin-select" value={productStatus} onChange={e => setProductStatus(e.target.value)}>
            {PRODUCT_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label className="admin-toolbar-groupby" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--slate)', cursor: 'pointer', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={groupBySet} onChange={e => setGroupBySet(e.target.checked)} />
            По сетам
          </label>
        </div>

        {/* Active filter chips */}
        {(brand || set || category || search || productStatus || stockFilter) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 20px', borderBottom: '1px solid var(--gray-200)' }}>
            {brand         && <Chip label={`Бренд: ${brand.replace('matkasym-', '').toUpperCase()}`} onRemove={() => setBrand('')} />}
            {set           && <Chip label={`Сет: ${set.toUpperCase()}`} onRemove={() => setSet('')} />}
            {category      && <Chip label={`Категория: ${categoryLabel(category)}`} onRemove={() => setCategory('')} />}
            {search        && <Chip label={`«${search}»`} onRemove={() => setSearch('')} />}
            {productStatus && <Chip label={PRODUCT_STATUS_META[productStatus]?.label || productStatus} onRemove={() => setProductStatus('')} />}
            {stockFilter   && <Chip label={stockFilter === 'in' ? '✅ В наличии' : '❌ Нет в наличии'} onRemove={() => setStockFilter('')} />}
          </div>
        )}

        {loading ? (
          <div className="admin-empty">Загрузка...</div>
        ) : products.length === 0 ? (
          <div className="admin-empty">Товары не найдены</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 96 }}></th>
                <th>Название / SKU</th>
                <th>Категория</th>
                <th>Бренд / Сет</th>
                <th>Роз. цена</th>
                <th>Склад</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groupKeys.map(gk => {
                const models = grouped[gk];
                const modelKeys = sortedModelKeys(models);
                return (
                  <>
                    {groupBySet && gk !== '__all__' && (
                      <tr key={`group-${gk}`} className="admin-table-group-row">
                        <td colSpan={8}>
                          {gk === '__none__' ? 'Без сета' : gk.toUpperCase()}
                          <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--slate)' }}>
                            {modelKeys.length} {modelKeys.length === 1 ? 'модель' : modelKeys.length < 5 ? 'модели' : 'моделей'}
                          </span>
                        </td>
                      </tr>
                    )}
                    {modelKeys.map(mk => {
                      const variants = models[mk];
                      const primary  = variants[0];
                      const imgUrl   = thumb(primary);
                      const multiColor = variants.length > 1;
                      const anyInStock = variants.some(v => v.inStock);
                      const allPlanned = variants.every(v => (v.productStatus || 'ready') === 'planned');
                      const anyImprovement = variants.some(v => v.productStatus === 'improvement');
                      const aggStatus = allPlanned ? 'planned' : anyImprovement ? 'improvement' : 'ready';

                      return (
                        <tr key={mk}>
                          <td
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`/admin/products/${primary._id}`)}
                          >
                            {imgUrl ? (
                              <img src={imgUrl} alt="" className="admin-table-img" />
                            ) : (
                              <div className="admin-table-img-placeholder">📦</div>
                            )}
                          </td>
                          <td>
                            <div
                              className="admin-table-name"
                              style={{ cursor: 'pointer' }}
                              onClick={() => navigate(`/admin/products/${primary._id}`)}
                            >{cleanName(primary.name)}</div>
                            {primary.tags?.includes('not-in-1c') && (
                              <span style={{
                                display: 'inline-block', marginTop: 3,
                                background: '#ff6b00', color: '#fff',
                                fontSize: 10, fontWeight: 700, letterSpacing: .4,
                                padding: '1px 6px', borderRadius: 4,
                              }}>НЕТ В 1С</span>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                              {multiColor
                                ? variants.map(v => (
                                    <button
                                      key={v._id}
                                      title={v.color || ''}
                                      onClick={() => navigate(`/admin/products/${v._id}`)}
                                      style={{
                                        width: 14, height: 14, borderRadius: '50%',
                                        background: COLOR_SWATCHES[v.color?.toLowerCase()] || '#bbb',
                                        border: ['white','grey','gray','silver','beige'].includes(v.color?.toLowerCase())
                                          ? '1.5px solid #ccc' : '1.5px solid rgba(0,0,0,.15)',
                                        cursor: 'pointer', flexShrink: 0,
                                        padding: 0, outline: 'none',
                                        transition: 'transform .1s',
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.3)'}
                                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                    />
                                  ))
                                : <span className="admin-table-sku">{primary.sku || '—'}</span>
                              }
                              {multiColor && (
                                <span className="admin-table-sku" style={{ marginLeft: 2 }}>
                                  {variants.length} цвета · {primary.sku || '—'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--slate)' }}>
                            {categoryLabel(primary.category)}
                          </td>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              {primary.brand?.replace('matkasym-', '').toUpperCase()}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--slate)' }}>
                              {primary.set || '—'}{primary.setLevel ? ` · ${primary.setLevel}` : ''}
                            </div>
                          </td>
                          <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {primary.price.toLocaleString('ru')} сом
                          </td>
                          <td>
                            {(() => {
                              const totalStock = variants.reduce((s, v) => s + (v.stock || 0), 0);
                              const color = totalStock > 10 ? '#2d7a3a' : totalStock > 0 ? '#c47a00' : '#c0392b';
                              return (
                                <span style={{ fontSize: 15, fontWeight: 800, color }}>
                                  {totalStock}
                                </span>
                              );
                            })()}
                          </td>
                          <td>
                            {(() => {
                              const ps = primary.productStatus || 'for_sale';
                              const pm = PRODUCT_STATUS_META[ps];
                              const icon = { for_sale: '🛒', planned: '📋', in_development: '🔨', improvement: '🔧', discontinued: '🚫' }[ps] || '';
                              const stageText = ps === 'in_development' && primary.developmentStage ? primary.developmentStage : null;
                              const stageIdx  = stageText ? CRM_STAGES.indexOf(stageText) : -1;
                              return (
                                <>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: pm?.color }}>{icon} {pm?.label || ps}</span>
                                  {stageText && (
                                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <div style={{ display: 'flex', gap: 2 }}>
                                        {CRM_STAGES.map((_, i) => (
                                          <div key={i} style={{
                                            width: 10, height: 4, borderRadius: 2,
                                            background: i <= stageIdx ? '#7c3aed' : '#e0e0e0',
                                          }} />
                                        ))}
                                      </div>
                                      <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        {stageText}
                                      </span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                            {primary.isNew && (
                              <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--red)', marginTop: 2 }}>NEW</span>
                            )}
                          </td>
                          <td>
                            {canEdit && (
                              <div className="admin-row-actions">
                                <button className="admin-btn-edit" onClick={() => navigate(`/admin/products/${primary._id}/edit`)}>
                                  Изменить
                                </button>
                                <button
                                  className="admin-btn-edit"
                                  style={{ background: '#f5f5f5', color: '#555' }}
                                  onClick={() => handleDuplicate(primary._id)}
                                  title="Создать копию с другим цветом"
                                >
                                  + Цвет
                                </button>
                                {!multiColor && (
                                  <button className="admin-btn-delete" onClick={() => handleDelete(primary._id, primary.fullName || primary.name)}>
                                    Удалить
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <div className="admin-pagination">
            <span>Страница {page} из {pages}</span>
            <div className="admin-pagination-btns">
              <button className="admin-pagination-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Назад</button>
              <button className="admin-pagination-btn" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ label, onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'var(--gray-100)', borderRadius: 20,
      padding: '3px 10px 3px 12px', fontSize: 12, fontWeight: 600, color: 'var(--dark)',
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', fontSize: 14, lineHeight: 1, padding: 0 }}
      >×</button>
    </span>
  );
}
