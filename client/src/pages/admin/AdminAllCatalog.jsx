import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetProducts } from '../../api';

const NO_PHOTO = '/logos/no-photo.png';

const SET_NAMES = {
  'önügüü-set':      'Önügüü Set',
  'dayar-tütük':     'Dayar Tütük',
  'achyk-asman':     'Achyk Asman',
  'den-sooluk':      'Den Sooluk',
  'zhashyl-ömür':    'Zhashyl Ömür',
  'jenil-ashkana':   'Jenil Ashkana',
  'konok-keldi':     'Konok Keldi',
  'korkom-aiym':     'Korkom Aiym',
  'kosh-keliniz':    'Kosh Keliniz',
  'onoi-sakta':      'Onoi Sakta',
  'sanarip-tv':      'Sanarip TV',
  'shirin-balalyk':  'Shirin Balalyk',
  'taza-kiym':       'Taza Kiym',
  'uydo-ishtoo':     'Uydo Ishtoo',
  'mazza-seiyl':     'Mazza Seiyl',
  '0-tashtandy':     '0-TASHTANDY',
  'bekem-fasad':     'Bekem Fasad',
  'bilim-kelechek':  'Bilim Kelechek',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'uzak-koldon':     'Uzak Koldon',
  'nelikvid':        'Неликвид',
  'samples':         'Образцы',
  'small-batch':     'Малосерийные',
  'misc':            'Разное',
  'equipment':       'Оборудование и сырьё',
  'other':           'Прочее',
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

function getPrice(p, mode) {
  if (mode === 'retail')    return p.price;
  if (mode === 'wholesale') return p.priceWholesale;
  if (mode === 'dealer')    return p.priceDealer;
  return null;
}

function setLabel(slug) {
  return SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function brandAccent(brandKey) {
  return BRAND_META[brandKey]?.accent || '#555';
}

function ProductCard({ product, priceMode, accent, navigate }) {
  const img   = product.images?.[0] || NO_PHOTO;
  const price = getPrice(product, priceMode);
  const hasStock   = product.stock > 0 || product.inStock;
  const stockLabel = product.stock > 0 ? `${product.stock} шт.` : (product.inStock ? 'Есть' : 'Нет');

  return (
    <div
      onClick={() => navigate(`/admin/products/${product._id}`)}
      style={{
        border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden',
        background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
        cursor: 'pointer', transition: 'box-shadow .15s, transform .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)';  e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#f8f8f8', position: 'relative' }}>
        <img src={img} alt={product.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { e.target.src = NO_PHOTO; }}
        />
        {product.sku && (
          <div style={{
            position: 'absolute', bottom: 6, left: 6,
            background: 'rgba(255,255,255,0.92)', borderRadius: 4,
            fontSize: 9, fontWeight: 700, padding: '2px 5px', color: '#555',
          }}>{product.sku}</div>
        )}
      </div>
      <div style={{ padding: '10px 11px' }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: '#111', lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {product.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: accent }}>
            {price > 0 ? `${price.toLocaleString('ru')} сом` : '—'}
          </div>
          <div style={{
            fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
            background: hasStock ? '#e8f5e9' : '#fce8e8',
            color:      hasStock ? '#2d7a3a' : '#c00',
          }}>
            {stockLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminAllCatalog() {
  const navigate = useNavigate();
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [priceMode, setPriceMode] = useState('retail');
  const [search,    setSearch]    = useState('');

  useEffect(() => {
    adminGetProducts({ limit: 1000 })
      .then(r => setProducts(r.data.products || []))
      .finally(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? products.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.fullName || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q)
      )
    : products;

  // Group by brand → set
  const tree = {}; // { brandKey: { setSlug: [products] } }
  const noBrand = {}; // { setSlug: [products] }

  filtered.forEach(p => {
    const brand = p.brand || '';
    const set   = p.set   || 'other';
    if (brand) {
      if (!tree[brand]) tree[brand] = {};
      if (!tree[brand][set]) tree[brand][set] = [];
      tree[brand][set].push(p);
    } else {
      if (!noBrand[set]) noBrand[set] = [];
      noBrand[set].push(p);
    }
  });

  const brandOrder = ['matkasym-home', 'matkasym-shaar', 'matkasym-kyzmat'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#f7f8fa', paddingBottom: 16, marginBottom: 4,
        borderBottom: '1px solid #eee',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 4 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}
          >←</button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>📦 Все товары</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
              {loading ? '…' : `${products.length} товаров`}
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

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск…"
            style={{
              padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0',
              fontSize: 13, width: 200, outline: 'none', background: '#fff',
            }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Ничего не найдено</div>
      ) : (
        <div style={{ paddingBottom: 40 }}>
          {/* Brands */}
          {brandOrder.map(brandKey => {
            const sets = tree[brandKey];
            if (!sets || Object.keys(sets).length === 0) return null;
            const accent = brandAccent(brandKey);
            const brandInfo = BRAND_META[brandKey];
            return (
              <div key={brandKey} style={{ marginBottom: 40 }}>
                {/* Brand header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                  borderLeft: `4px solid ${accent}`, paddingLeft: 12,
                }}>
                  <span style={{ fontWeight: 900, fontSize: 16, color: accent, letterSpacing: 1 }}>
                    {brandInfo?.label || brandKey.toUpperCase()}
                  </span>
                </div>

                {/* Sets within brand */}
                {Object.entries(sets).sort(([a], [b]) => a.localeCompare(b)).map(([setSlug, prods]) => {
                  // Group by name within set
                  const grouped = {};
                  prods.forEach(p => {
                    const k = p.name || p._id;
                    if (!grouped[k]) grouped[k] = [];
                    grouped[k].push(p);
                  });
                  const models = Object.entries(grouped);

                  return (
                    <div key={setSlug} style={{ marginBottom: 28 }}>
                      {/* Set header */}
                      <div style={{
                        fontSize: 13, fontWeight: 800, color: '#444',
                        textTransform: 'uppercase', letterSpacing: 0.8,
                        marginBottom: 12,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span>{setLabel(setSlug)}</span>
                        <span style={{ fontWeight: 400, fontSize: 11, color: '#aaa' }}>
                          {prods.length} тов.
                        </span>
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                        gap: 12,
                      }}>
                        {models.map(([name, variants]) => (
                          <ProductCard
                            key={name}
                            product={variants[0]}
                            priceMode={priceMode}
                            accent={accent}
                            navigate={navigate}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Products without brand */}
          {Object.keys(noBrand).length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                borderLeft: '4px solid #888', paddingLeft: 12,
              }}>
                <span style={{ fontWeight: 900, fontSize: 16, color: '#888', letterSpacing: 1 }}>
                  ПРОЧИЕ
                </span>
              </div>
              {Object.entries(noBrand).sort(([a], [b]) => a.localeCompare(b)).map(([setSlug, prods]) => {
                const grouped = {};
                prods.forEach(p => {
                  const k = p.name || p._id;
                  if (!grouped[k]) grouped[k] = [];
                  grouped[k].push(p);
                });
                return (
                  <div key={setSlug} style={{ marginBottom: 28 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 800, color: '#666',
                      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span>{setLabel(setSlug)}</span>
                      <span style={{ fontWeight: 400, fontSize: 11, color: '#aaa' }}>{prods.length} тов.</span>
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                      gap: 12,
                    }}>
                      {Object.entries(grouped).map(([name, variants]) => (
                        <ProductCard
                          key={name}
                          product={variants[0]}
                          priceMode={priceMode}
                          accent="#555"
                          navigate={navigate}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
