import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminGetProducts, adminDeleteProduct, adminGetFacets } from '../../api/index';
import { cloudinaryOpt } from '../../utils/drive';
import { CATEGORIES } from '../../config/categorySpecs';

const BRANDS = [
  { value: '', label: 'Все бренды' },
  { value: 'matkasym-home',  label: 'HOME' },
  { value: 'matkasym-shaar', label: 'SHAAR' },
];

const STOCK_OPTIONS = [
  { value: '',      label: 'Любой статус' },
  { value: 'true',  label: 'В наличии' },
  { value: 'false', label: 'Нет в наличии' },
];

const PRODUCT_STATUS_OPTIONS = [
  { value: '',            label: 'Все статусы' },
  { value: 'planned',     label: '📋 В плане' },
  { value: 'improvement', label: '🔧 На улучшении' },
  { value: 'ready',       label: '✅ Готовые' },
];

const PRODUCT_STATUS_META = {
  planned:     { label: 'В плане',       bg: '#eef2ff', color: '#3b5bdb' },
  improvement: { label: 'На улучшении',  bg: '#fff8e6', color: '#c47a00' },
  ready:       { label: 'Готовый',       bg: '#e6f4ea', color: '#2d7a3a' },
};

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

  // Filters
  const [search,   setSearch]   = useState('');
  const [brand,    setBrand]    = useState('');
  const [set,      setSet]      = useState('');
  const [category, setCategory] = useState('');
  const [inStock,        setInStock]        = useState('');
  const [productStatus,  setProductStatus]  = useState('');
  const [page,           setPage]           = useState(1);
  const [groupBySet, setGroupBySet] = useState(true);

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

  // Reset dependent filters when parent changes
  useEffect(() => { setSet(''); setCategory(''); setPage(1); }, [brand]);
  useEffect(() => { setCategory(''); setPage(1); }, [set]);
  useEffect(() => { setPage(1); }, [category, search, inStock, productStatus]);

  // Load products
  const load = useCallback(() => {
    setLoading(true);
    adminGetProducts({
      page, limit: 50, search,
      brand:         brand         || undefined,
      set:           set           || undefined,
      category:      category      || undefined,
      inStock:       inStock       || undefined,
      productStatus: productStatus || undefined,
    })
      .then(r => {
        setProducts(r.data.products);
        setTotal(r.data.total);
        setPages(r.data.pages);
      })
      .finally(() => setLoading(false));
  }, [page, search, brand, set, category, inStock]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Удалить «${name}»?`)) return;
    await adminDeleteProduct(id);
    load();
  };

  // Group by set (memoized)
  const grouped = useMemo(() =>
    groupBySet
      ? products.reduce((acc, p) => {
          const key = p.set || '__none__';
          if (!acc[key]) acc[key] = [];
          acc[key].push(p);
          return acc;
        }, {})
      : { __all__: products }
  , [products, groupBySet]);

  const groupKeys = useMemo(() =>
    Object.keys(grouped).sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      if (a === '__all__')  return 0;
      return a.localeCompare(b);
    })
  , [grouped]);

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">
          Товары{' '}
          <span style={{ color: 'var(--slate)', fontWeight: 500, fontSize: 18 }}>{total}</span>
        </h1>
        <Link to="/admin/products/new" className="btn btn-primary btn-sm">+ Добавить</Link>
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
              <option key={s} value={s}>{s.toUpperCase()}</option>
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

          {/* Stock */}
          <select className="admin-select" value={inStock} onChange={e => setInStock(e.target.value)}>
            {STOCK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        {(brand || set || category || inStock || search || productStatus) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 20px', borderBottom: '1px solid var(--gray-200)' }}>
            {brand    && <Chip label={`Бренд: ${brand.replace('matkasym-', '').toUpperCase()}`} onRemove={() => setBrand('')} />}
            {set      && <Chip label={`Сет: ${set.toUpperCase()}`} onRemove={() => setSet('')} />}
            {category && <Chip label={`Категория: ${categoryLabel(category)}`} onRemove={() => setCategory('')} />}
            {inStock  && <Chip label={inStock === 'true' ? 'В наличии' : 'Нет в наличии'} onRemove={() => setInStock('')} />}
            {search        && <Chip label={`«${search}»`} onRemove={() => setSearch('')} />}
            {productStatus && <Chip label={PRODUCT_STATUS_META[productStatus]?.label || productStatus} onRemove={() => setProductStatus('')} />}
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
                <th style={{ width: 60 }}></th>
                <th>Название / SKU</th>
                <th>Категория</th>
                <th>Бренд / Сет</th>
                <th>Цена</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groupKeys.map(gk => (
                <>
                  {groupBySet && gk !== '__all__' && (
                    <tr key={`group-${gk}`} className="admin-table-group-row">
                      <td colSpan={7}>
                        {gk === '__none__' ? 'Без сета' : gk.toUpperCase()}
                        <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--slate)' }}>
                          {grouped[gk].length} шт.
                        </span>
                      </td>
                    </tr>
                  )}
                  {grouped[gk].map(p => {
                    const imgUrl = thumb(p);
                    return (
                      <tr key={p._id}>
                        <td>
                          {imgUrl ? (
                            <img src={imgUrl} alt="" className="admin-table-img" />
                          ) : (
                            <div className="admin-table-img-placeholder">📦</div>
                          )}
                        </td>
                        <td>
                          <div className="admin-table-name">{p.fullName || p.name}</div>
                          <div className="admin-table-sku">{p.sku || '—'}</div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--slate)' }}>
                          {categoryLabel(p.category)}
                        </td>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {p.brand?.replace('matkasym-', '').toUpperCase()}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--slate)' }}>
                            {p.set || '—'}{p.setLevel ? ` · ${p.setLevel}` : ''}
                          </div>
                        </td>
                        <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {p.price.toLocaleString('ru')} сом
                          {p.oldPrice > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--slate)', textDecoration: 'line-through', fontWeight: 400 }}>
                              {p.oldPrice.toLocaleString('ru')}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`admin-badge-stock ${p.inStock ? 'in' : 'out'}`}>
                            {p.inStock ? 'В наличии' : 'Нет'}
                          </span>
                          {p.isNew && (
                            <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--red)', marginTop: 2 }}>NEW</span>
                          )}
                          {p.productStatus && p.productStatus !== 'ready' && (() => {
                            const s = PRODUCT_STATUS_META[p.productStatus];
                            return s ? (
                              <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: s.color, marginTop: 3 }}>
                                {p.productStatus === 'planned' ? '📋' : '🔧'} {s.label}
                              </span>
                            ) : null;
                          })()}
                        </td>
                        <td>
                          <div className="admin-row-actions">
                            <button className="admin-btn-edit" onClick={() => navigate(`/admin/products/${p._id}`)}>
                              Изменить
                            </button>
                            <button className="admin-btn-delete" onClick={() => handleDelete(p._id, p.fullName)}>
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
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
