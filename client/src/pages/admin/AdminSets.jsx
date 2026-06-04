import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AdminProductModal from './AdminProductModal';
import {
  adminGetFacets, adminGetProducts,
  adminGetBrands, adminAddBrandSet, adminUpdateBrandSet, adminDeleteBrandSet,
} from '../../api';
import AdminPdfButton from './AdminPdfButton';
import { useLazyItems } from '../../hooks/useLazyItems';
import { cloudinaryOpt } from '../../utils/drive';
import { SupplierBadge, StatusBadge, STATUS_BADGE } from '../../components/ProductBadges';

// ── constants ──────────────────────────────────────────────────────────────────

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

const EXCLUDE = new Set(['samples', 'small-batch', 'misc', 'equipment', 'other']);

const PROCHIYE = [
  { slug: 'samples',     label: 'Obraztsy' },
  { slug: 'small-batch', label: 'Malaya Partiya' },
  { slug: 'misc',        label: 'Raznoe' },
  { slug: 'equipment',   label: 'Oborudovanie' },
  { slug: 'other',       label: 'Prochee' },
];

const BRAND_META = {
  'matkasym-home':   { label: 'HOME',   accent: '#DC1E24' },
  'matkasym-shaar':  { label: 'SHAAR',  accent: '#3463A3' },
  'matkasym-kyzmat': { label: 'KYZMAT', accent: '#267846' },
};

const SET_SUB_ITEMS = {
  'onuguu-set':  ['Лазер', 'Гибка', 'Сварка', 'Труборез', 'Покраска'],
  'dayar-tutuk': ['Трубопрокат'],
};

function toTitle(slug) {
  return SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setMob(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mob;
}

// ── BrandSection ──────────────────────────────────────────────────────────────

function slugify(name) {
  return name.trim().toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function BrandSection({ brandKey, sets, accent, subItems = {}, autoOpenSet, onOpenCatalog, onCloseCatalog }) {
  const [editing, setEditing]     = useState(false);
  const [catalogSlug, setCatalog] = useState(() => autoOpenSet || null);
  const isMobile                  = useIsMobile();

  function handleOpenCatalog(slug) {
    setCatalog(slug);
    onOpenCatalog?.(brandKey, slug);
  }

  function handleCloseCatalog() {
    setCatalog(null);
    onCloseCatalog?.();
  }

  const [customSets,  setCustomSets]  = useState([]);
  const [showAddSet,  setShowAddSet]  = useState(false);
  const [newSetName,  setNewSetName]  = useState('');
  const [addingSet,   setAddingSet]   = useState(false);
  const [addSetError, setAddSetError] = useState('');
  const [editingSetKey, setEditingSetKey] = useState(null);
  const [editSetLabel,  setEditSetLabel]  = useState('');

  useEffect(() => {
    adminGetBrands().then(r => {
      const brand = r.data.find(b => b.key === brandKey);
      if (brand) setCustomSets(brand.sets || []);
    });
  }, [brandKey]);

  const allSets = [...new Set([...sets, ...customSets.map(s => s.key)])];

  async function handleAddSet() {
    const name = newSetName.trim();
    if (!name) return;
    const slug = slugify(name);
    setAddingSet(true);
    setAddSetError('');
    try {
      const res = await adminAddBrandSet(brandKey, slug, name);
      setCustomSets(res.data.sets || []);
      setNewSetName('');
      setShowAddSet(false);
    } catch (e) {
      setAddSetError(e?.response?.data?.error || 'Ошибка при добавлении сета');
    } finally { setAddingSet(false); }
  }

  async function handleDeleteSet(slug) {
    if (!window.confirm(`Удалить сет «${slug}»?`)) return;
    const res = await adminDeleteBrandSet(brandKey, slug);
    setCustomSets(res.data.sets || []);
  }

  async function handleUpdateSet(slug) {
    if (!editSetLabel.trim()) return;
    try {
      const res = await adminUpdateBrandSet(brandKey, slug, { label: editSetLabel.trim() });
      setCustomSets(res.data.sets || []);
      setEditingSetKey(null);
      setEditSetLabel('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Ошибка при обновлении');
    }
  }

  function startEditSet(slug, currentLabel) {
    setEditingSetKey(slug);
    setEditSetLabel(currentLabel);
  }

  const pad = isMobile ? '20px 16px' : '32px 36px';

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: pad, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: isMobile ? 36 : 46, fontWeight: 800, letterSpacing: -1, color: '#1c1c1c', lineHeight: 1 }}>
            {BRAND_META[brandKey].label}
          </div>
          <div style={{ height: 3, width: 50, background: accent, borderRadius: 2, margin: '8px 0 6px' }} />
          <div style={{ fontSize: 12, color: '#6b8997' }}>
            Линейки <span style={{ fontWeight: 700, color: accent }}>сетов</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {editing ? (
            <>
              <button onClick={() => setShowAddSet(v => !v)} style={btn('#f0fff4','#267846')}>+ Сет</button>
              <button onClick={() => { setEditing(false); setShowAddSet(false); setNewSetName(''); }} style={btn(accent,'#fff',true)}>Готово</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={btn('#f5f5f5','#333')}>✏️ Изменить</button>
          )}
        </div>
      </div>

      {/* Add-set form */}
      {editing && showAddSet && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          background: '#f0fff4', borderRadius: 8, padding: '10px 12px', border: '1px solid #c8ecd4' }}>
          <input
            value={newSetName}
            onChange={e => setNewSetName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddSet()}
            placeholder="Название сета"
            autoFocus
            style={{ flex: 1, minWidth: 160, fontSize: 13, border: '1px solid #b2d8c0',
              borderRadius: 6, padding: '6px 10px', outline: 'none' }}
          />
          {newSetName.trim() && (
            <span style={{ fontSize: 11, color: '#888', flexShrink: 0, fontFamily: 'monospace' }}>
              /{slugify(newSetName.trim())}
            </span>
          )}
          <button onClick={handleAddSet} disabled={addingSet || !newSetName.trim()}
            style={btn('#267846','#fff',true)}>
            {addingSet ? '…' : 'Добавить'}
          </button>
          <button onClick={() => { setShowAddSet(false); setNewSetName(''); setAddSetError(''); }}
            style={btn('#f5f5f5','#555')}>Отмена</button>
          {addSetError && (
            <span style={{ fontSize: 11, color: '#c00', width: '100%' }}>{addSetError}</span>
          )}
        </div>
      )}

      {/* Sets list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {allSets.map((slug, i) => {
          const customSet = customSets.find(cs => cs.key === slug);
          const displayLabel = customSet?.label || toTitle(slug);
          const isEditing = editingSetKey === slug;

          return (
          <div key={slug}
            style={{ padding: '8px 10px', background: i % 2 === 0 ? '#f8f9fb' : '#fff', borderRadius: 6 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 20, textAlign: 'right', fontWeight: 700, fontSize: 12, color: accent, flexShrink: 0 }}>
                {i + 1}
              </span>
              <span style={{ color: '#ccc', fontSize: 13 }}>|</span>

              {editing && isEditing ? (
                <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    value={editSetLabel}
                    onChange={e => setEditSetLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateSet(slug)}
                    autoFocus
                    style={{ flex: 1, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, padding: '4px 8px' }}
                  />
                  <button onClick={() => handleUpdateSet(slug)} style={btn('#267846','#fff',true)}>✓</button>
                  <button onClick={() => { setEditingSetKey(null); setEditSetLabel(''); }} style={btn('#f5f5f5','#555')}>✕</button>
                </div>
              ) : (
                <span
                  onClick={() => !editing && handleOpenCatalog(slug)}
                  onDoubleClick={() => editing && customSet && startEditSet(slug, displayLabel)}
                  style={{ fontSize: 13, color: '#1c1c1c', flex: 1, minWidth: 0,
                    cursor: editing ? (customSet ? 'text' : 'default') : 'pointer',
                    textDecoration: editing ? 'none' : 'underline',
                    textDecorationStyle: 'dotted', textDecorationColor: '#bbb',
                  }}
                  title={editing && customSet ? 'Двойной клик для редактирования' : ''}
                >{displayLabel}</span>
              )}

              {editing && customSet && !isEditing && (
                <>
                  <button onClick={() => startEditSet(slug, displayLabel)}
                    title="Редактировать название"
                    style={{ color: '#666', background: 'none', border: 'none',
                      cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>
                    ✏️
                  </button>
                  <button onClick={() => handleDeleteSet(slug)}
                    title="Удалить сет"
                    style={{ color: '#c00', background: 'none', border: 'none',
                      cursor: 'pointer', fontSize: 13, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>
                    ✕
                  </button>
                </>
              )}
            </div>

            {subItems[slug] && (
              <div style={{ paddingLeft: 36, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {subItems[slug].map(sub => (
                  <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
                    <div style={{ width: 3, height: 13, background: accent, borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ color: '#bbb', fontSize: 11 }}>—</span>
                    <span style={{ fontSize: 12, color: '#555' }}>{sub}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );})}
      </div>

      {catalogSlug && (
        <SetCatalogPanel brandKey={brandKey} setSlug={catalogSlug} onClose={handleCloseCatalog} />
      )}
    </div>
  );
}


// ── SetCatalogPanel ───────────────────────────────────────────────────────────

const RETAIL_BRANDS = new Set(['matkasym-home', 'matkasym-shaar']);
const NO_PHOTO      = '/logos/no-photo.png';

const PRICE_MODES = [
  { key: 'retail',    label: 'Розничная', short: 'Розн.' },
  { key: 'wholesale', label: 'Оптовая',   short: 'Опт.'  },
  { key: 'dealer',    label: 'Дилерская', short: 'Дил.'  },
  { key: 'none',      label: 'Без цен',   short: 'Без'   },
];

function getPrice(product, mode) {
  if (mode === 'retail')    return product.price;
  if (mode === 'wholesale') return product.priceWholesale;
  if (mode === 'dealer')    return product.priceDealer;
  return null;
}
function getPriceLabel(mode) {
  return PRICE_MODES.find(m => m.key === mode)?.label || '';
}

function SetCatalogPanel({ brandKey, setSlug, onClose, accentOverride, titleOverride }) {
  const accent      = accentOverride || BRAND_META[brandKey]?.accent || '#555';
  const defaultMode = RETAIL_BRANDS.has(brandKey) ? 'retail' : 'retail';
  const [priceMode, setPriceMode]         = useState(defaultMode);
  const [products,  setProducts]          = useState([]);
  const [loading,   setLoading]           = useState(true);
  const scrollRef = useRef(null);
  const [detailProduct, setDetailProduct] = useState(null);
  const [viewMode,  setViewMode]  = useState(() => localStorage.getItem('adminCatalogView') || 'grid');
  const isMobile = useIsMobile();

  const toggleView = () => {
    const next = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(next);
    localStorage.setItem('adminCatalogView', next);
  };

  // Lock body scroll while panel is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    setLoading(true);
    adminGetProducts({ set: setSlug, limit: 1000, page: 1 })
      .then(r => { setProducts(r.data.products || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [brandKey, setSlug]);

  const models = useMemo(() => {
    const grouped = {};
    products.forEach(p => {
      if (!grouped[p.name]) grouped[p.name] = [];
      grouped[p.name].push(p);
    });
    return Object.entries(grouped);
  }, [products]);

  // Группировка по типу для труб (dayar-tutuk)
  const tubeGroups = useMemo(() => {
    if (setSlug !== 'dayar-tutuk') return null;
    const groups = {
      'Круглые': [],
      'Квадратные': [],
      'Овальные': [],
      'Прямоугольные': [],
      'Прочие': [],
    };
    models.forEach(([name, variants]) => {
      const lowerName = name.toLowerCase();
      if (lowerName.includes('круглая')) groups['Круглые'].push([name, variants]);
      else if (lowerName.includes('квадратная')) groups['Квадратные'].push([name, variants]);
      else if (lowerName.includes('овальная')) groups['Овальные'].push([name, variants]);
      else if (lowerName.includes('прямоугольная')) groups['Прямоугольные'].push([name, variants]);
      else groups['Прочие'].push([name, variants]);
    });
    // Убираем пустые группы
    return Object.entries(groups).filter(([, items]) => items.length > 0);
  }, [setSlug, models]);

  const [openGroups, setOpenGroups] = useState({});

  const { visible, sentinelRef, hasMore } = useLazyItems(models, 24, scrollRef.current);

  const priceLabel = getPriceLabel(priceMode);

  // On desktop — full screen (covers sidebar too); on mobile — full screen
  const panelStyle = {
    position: 'fixed', inset: 0,
    background: '#f7f8fa', zIndex: 1500,
    display: 'flex', flexDirection: 'column',
  };

  return createPortal(
    <>
      {/* Mobile-only backdrop tap-to-close */}
      {isMobile && (
        <div onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1499 }} />
      )}

      <div style={panelStyle}>

        {/* Header */}
        <div style={{
          padding: '0 20px', height: 56, background: '#fff',
          borderBottom: '1px solid #eee',
          display: 'flex', alignItems: 'center', gap: 12,
          flexShrink: 0, flexWrap: 'wrap',
        }}>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 22, color: '#555', padding: '0 4px', flexShrink: 0, lineHeight: 1 }}>
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#111', lineHeight: 1 }}>
              {titleOverride || toTitle(setSlug)}
            </div>
            {BRAND_META[brandKey]?.label && (
              <div style={{ fontSize: 11, color: accent, fontWeight: 600, marginTop: 1 }}>
                {BRAND_META[brandKey].label}
              </div>
            )}
          </div>

          {/* Stats inline */}
          {!loading && (
            <div style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>
              {products.length} тов. · {models.length} мод.
            </div>
          )}

          {/* Price toggle */}
          <div style={{ display: 'flex', gap: 0, background: '#f5f5f5', borderRadius: 8, padding: 3, flexShrink: 0 }}>
            {PRICE_MODES.filter(m => m.key !== 'none').map(m => (
              <button key={m.key} onClick={() => setPriceMode(m.key)} style={{
                padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                background: priceMode === m.key ? accent : 'transparent',
                color:      priceMode === m.key ? '#fff'  : '#888',
              }}>{m.short}</button>
            ))}
          </div>

          {/* View toggle */}
          <button onClick={toggleView} title={viewMode === 'grid' ? 'Список' : 'Сетка'} style={{
            padding: '5px 10px', borderRadius: 6, border: '1.5px solid #e0e0e0',
            background: '#fff', cursor: 'pointer', fontSize: 16, color: '#555', lineHeight: 1, flexShrink: 0,
          }}>
            {viewMode === 'grid' ? '☰' : '⊞'}
          </button>

          {/* PDF button */}
          <AdminPdfButton products={products} label={titleOverride || toTitle(setSlug)} />
        </div>

        {/* Product grid — scrollable */}
        <div ref={scrollRef} style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          padding: isMobile ? '12px 10px' : '20px 24px',
        }}>
          {loading ? (
            <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
          ) : models.length === 0 ? (
            <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Нет товаров</div>
          ) : viewMode === 'list' && tubeGroups ? (
            /* Animated Accordion for tubes (dayar-tutuk) */
            <>
              <style>{`
                @keyframes tubeAccordionSlideIn {
                  from { opacity: 0; transform: translateY(-8px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                @keyframes tubeItemFadeIn {
                  from { opacity: 0; transform: translateX(-12px); }
                  to { opacity: 1; transform: translateX(0); }
                }
                @keyframes tubePulse {
                  0%, 100% { box-shadow: 0 0 0 0 rgba(38, 120, 70, 0.2); }
                  50% { box-shadow: 0 0 0 4px rgba(38, 120, 70, 0); }
                }
                .tube-accordion-group {
                  border: 1px solid #e0e0e0;
                  border-radius: 14px;
                  overflow: hidden;
                  background: linear-gradient(135deg, #fff 0%, #fafbfc 100%);
                  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .tube-accordion-group:hover {
                  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
                  border-color: #c8d4c8;
                }
                .tube-accordion-header {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  padding: 14px 18px;
                  cursor: pointer;
                  background: linear-gradient(135deg, #f8faf8 0%, #f0f4f0 100%);
                  transition: all 0.25s ease;
                  position: relative;
                  overflow: hidden;
                }
                .tube-accordion-header::before {
                  content: '';
                  position: absolute;
                  left: 0;
                  top: 0;
                  height: 100%;
                  width: 4px;
                  background: linear-gradient(180deg, #267846 0%, #3a9d5c 100%);
                  transform: scaleY(0);
                  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .tube-accordion-header.open::before {
                  transform: scaleY(1);
                }
                .tube-accordion-header:hover {
                  background: linear-gradient(135deg, #f0f7f0 0%, #e8f2e8 100%);
                }
                .tube-accordion-header.open {
                  background: linear-gradient(135deg, #e8f5e9 0%, #dceedd 100%);
                  border-bottom: 1px solid #c8e6c9;
                }
                .tube-accordion-icon {
                  width: 28px;
                  height: 28px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: linear-gradient(135deg, #267846 0%, #2d8a50 100%);
                  border-radius: 8px;
                  color: #fff;
                  font-size: 12px;
                  font-weight: 700;
                  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
                  box-shadow: 0 2px 6px rgba(38, 120, 70, 0.3);
                }
                .tube-accordion-icon.open {
                  transform: rotate(90deg);
                  background: linear-gradient(135deg, #1b5e20 0%, #267846 100%);
                }
                .tube-accordion-title {
                  font-size: 15px;
                  font-weight: 700;
                  color: #1a3d1a;
                  letter-spacing: -0.3px;
                  transition: color 0.2s;
                }
                .tube-accordion-header:hover .tube-accordion-title {
                  color: #267846;
                }
                .tube-accordion-badge {
                  font-size: 11px;
                  font-weight: 600;
                  color: #fff;
                  background: linear-gradient(135deg, #78909c 0%, #607d8b 100%);
                  padding: 3px 10px;
                  border-radius: 12px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                  transition: all 0.25s;
                }
                .tube-accordion-header.open .tube-accordion-badge {
                  background: linear-gradient(135deg, #267846 0%, #2d8a50 100%);
                }
                .tube-accordion-content {
                  max-height: 0;
                  overflow: hidden;
                  transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                  background: #fff;
                }
                .tube-accordion-content.open {
                  max-height: 2000px;
                }
                .tube-item {
                  display: flex;
                  align-items: center;
                  gap: 12px;
                  padding: 10px 14px;
                  border-bottom: 1px solid #f0f0f0;
                  cursor: pointer;
                  transition: all 0.2s ease;
                  position: relative;
                }
                .tube-item:last-child {
                  border-bottom: none;
                }
                .tube-item::after {
                  content: '';
                  position: absolute;
                  left: 0;
                  top: 0;
                  bottom: 0;
                  width: 0;
                  background: linear-gradient(90deg, rgba(38, 120, 70, 0.08) 0%, transparent 100%);
                  transition: width 0.3s ease;
                }
                .tube-item:hover::after {
                  width: 100%;
                }
                .tube-item:hover {
                  background: #f8faf8;
                }
                .tube-item:active {
                  transform: scale(0.995);
                }
                .tube-item-img {
                  width: 48px;
                  height: 48px;
                  object-fit: cover;
                  border-radius: 10px;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                  transition: transform 0.2s, box-shadow 0.2s;
                  position: relative;
                  z-index: 1;
                }
                .tube-item:hover .tube-item-img {
                  transform: scale(1.05);
                  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
                }
                .tube-item-name {
                  font-size: 13px;
                  font-weight: 600;
                  color: #222;
                  transition: color 0.2s;
                  position: relative;
                  z-index: 1;
                }
                .tube-item:hover .tube-item-name {
                  color: #267846;
                }
                .tube-item-price {
                  font-size: 13px;
                  font-weight: 800;
                  transition: transform 0.2s;
                  position: relative;
                  z-index: 1;
                }
                .tube-item:hover .tube-item-price {
                  transform: scale(1.05);
                }
                .tube-stock-badge {
                  font-size: 10px;
                  font-weight: 700;
                  padding: 4px 10px;
                  border-radius: 6px;
                  transition: all 0.2s;
                  position: relative;
                  z-index: 1;
                }
                .tube-stock-badge.in-stock {
                  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
                  color: #2d7a3a;
                }
                .tube-stock-badge.out-stock {
                  background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
                  color: #c62828;
                }
              `}</style>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tubeGroups.map(([groupName, items], groupIdx) => {
                  const isOpen = openGroups[groupName] ?? false;
                  return (
                    <div
                      key={groupName}
                      className="tube-accordion-group"
                      style={{ animation: `tubeAccordionSlideIn 0.4s ease ${groupIdx * 0.08}s both` }}
                    >
                      <div
                        className={`tube-accordion-header ${isOpen ? 'open' : ''}`}
                        onClick={() => setOpenGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div className={`tube-accordion-icon ${isOpen ? 'open' : ''}`}>▶</div>
                          <span className="tube-accordion-title">{groupName}</span>
                        </div>
                        <span className="tube-accordion-badge">{items.length} шт</span>
                      </div>
                      <div className={`tube-accordion-content ${isOpen ? 'open' : ''}`}>
                        {items.map(([name, variants], itemIdx) => {
                          const primary = variants[0];
                          const img = cloudinaryOpt(primary.images?.[0] || NO_PHOTO, 80);
                          const price = getPrice(primary, priceMode);
                          const hasStock = primary.stock > 0 || primary.inStock;
                          const stockLabel = primary.stock > 0 ? `${primary.stock} шт.` : (primary.inStock ? 'Есть' : 'Нет');
                          return (
                            <div
                              key={name}
                              className="tube-item"
                              onClick={() => setDetailProduct(primary)}
                              style={{ animation: isOpen ? `tubeItemFadeIn 0.3s ease ${itemIdx * 0.03}s both` : 'none' }}
                            >
                              <img
                                src={img}
                                alt={name}
                                className="tube-item-img"
                                onError={e => { e.target.src = NO_PHOTO; }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="tube-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {name}
                                </div>
                              </div>
                              <div
                                className="tube-item-price"
                                style={{
                                  color: primary.priceUndefined ? '#888' : accent,
                                  fontStyle: primary.priceUndefined ? 'italic' : 'normal'
                                }}
                              >
                                {primary.priceUndefined ? 'Цена не определена' : (price > 0 ? `${price.toLocaleString('ru')} сом` : '—')}
                              </div>
                              <div className={`tube-stock-badge ${hasStock ? 'in-stock' : 'out-stock'}`}>
                                {stockLabel}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : viewMode === 'list' ? (
            <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
              {visible.map(([name, variants]) => {
                const primary  = variants[0];
                const img      = cloudinaryOpt(primary.images?.[0] || NO_PHOTO, 80);
                const price    = getPrice(primary, priceMode);
                const hasStock = primary.stock > 0 || primary.inStock;
                const stockLabel = primary.stock > 0 ? `${primary.stock} шт.` : (primary.inStock ? 'Есть' : 'Нет');
                return (
                  <div key={name} onClick={() => setDetailProduct(primary)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                      borderBottom: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <img src={img} alt={name}
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                      onError={e => { e.target.src = NO_PHOTO; }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <SupplierBadge product={primary} size="small" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                      </div>
                      {primary.sku && <div style={{ fontSize: 10, color: '#ccc' }}>{primary.sku}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: primary.priceUndefined ? '#888' : accent, flexShrink: 0, fontStyle: primary.priceUndefined ? 'italic' : 'normal' }}>
                      {primary.priceUndefined ? 'Цена не определена' : (price > 0 ? `${price.toLocaleString('ru')} сом` : '—')}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5, flexShrink: 0,
                      background: hasStock ? '#e8f5e9' : '#fce8e8', color: hasStock ? '#2d7a3a' : '#c00' }}>
                      {stockLabel}
                    </div>
                  </div>
                );
              })}
              {hasMore && <div ref={sentinelRef} style={{ height: 20 }} />}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: isMobile ? 10 : 16,
            }}>
              {visible.map(([name, variants]) => {
                const primary    = variants[0];
                const img        = cloudinaryOpt(primary.images?.[0] || NO_PHOTO, 400);
                const price      = getPrice(primary, priceMode);
                const hasStock   = primary.stock > 0 || primary.inStock;
                const stockLabel = primary.stock > 0 ? `${primary.stock} шт.` : (primary.inStock ? 'Есть' : 'Нет');
                const showBadge  = STATUS_BADGE[primary.productStatus];
                return (
                  <div key={name} onClick={() => setDetailProduct(primary)}
                    style={{ border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden',
                      background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                      cursor: 'pointer', transition: 'box-shadow .15s, transform .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)';  e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#f8f8f8', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={img} alt={name}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onError={e => { e.target.src = NO_PHOTO; }} />
                      {primary.isSupplied && (
                        <div style={{ position: 'absolute', top: 6, left: 6 }}>
                          <SupplierBadge product={primary} />
                        </div>
                      )}
                      {showBadge && (
                        <div style={{ position: 'absolute', top: 6, right: 6 }}>
                          <StatusBadge product={primary} />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '10px 11px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111', lineHeight: 1.3,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {name}
                      </div>
                      {variants.length > 1 && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{variants.length} вариантов</div>}
                      {primary.specs?.slice(0, 2).map(s => (
                        <div key={s.key} style={{ fontSize: 10, color: '#888', marginTop: 2, lineHeight: 1.2 }}>
                          <span style={{ color: '#bbb' }}>{s.key}:</span> {s.value}
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                        <div>
                          {primary.priceUndefined ? (
                            <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>Цена не определена</div>
                          ) : (
                            <>
                              <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, lineHeight: 1 }}>{priceLabel}</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: accent, lineHeight: 1.2 }}>
                                {price > 0 ? `${price.toLocaleString('ru')} сом` : '—'}
                              </div>
                            </>
                          )}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
                          background: hasStock ? '#e8f5e9' : '#fce8e8', color: hasStock ? '#2d7a3a' : '#c00' }}>
                          {stockLabel}
                        </div>
                      </div>
                      {primary.sku && <div style={{ fontSize: 9, color: '#ccc', marginTop: 2 }}>{primary.sku}</div>}
                    </div>
                  </div>
                );
              })}
              {hasMore && <div ref={sentinelRef} style={{ height: 20, gridColumn: '1 / -1' }} />}
            </div>
          )}
        </div>
      </div>

      {/* Product detail modal */}
      {detailProduct && (
        <AdminProductModal product={detailProduct} onClose={() => setDetailProduct(null)}
          onDeleted={id => { setProducts(p => p.filter(x => x._id !== id)); setDetailProduct(null); }} />
      )}
    </>,
    document.body
  );
}

// ── ProchiyeSection ───────────────────────────────────────────────────────────

function ProchiyeSection() {
  const [catalogSlug, setCatalog] = useState(null);
  const [catalogTitle, setCatalogTitle] = useState('');
  const isMobile = useIsMobile();
  const accent   = '#555';
  const pad      = isMobile ? '20px 16px' : '32px 36px';

  function openCatalog(slug, label) {
    setCatalog(slug);
    setCatalogTitle(label);
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: pad, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: isMobile ? 36 : 46, fontWeight: 800, letterSpacing: -1, color: '#1c1c1c', lineHeight: 1 }}>
          ПРОЧИЕ
        </div>
        <div style={{ height: 3, width: 50, background: accent, borderRadius: 2, margin: '8px 0 6px' }} />
        <div style={{ fontSize: 12, color: '#6b8997' }}>
          Дополнительные категории товаров
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {PROCHIYE.map((item, i) => (
          <div key={item.slug}
            style={{ padding: '8px 10px', background: i % 2 === 0 ? '#f8f9fb' : '#fff', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 20, textAlign: 'right', fontWeight: 700, fontSize: 12, color: accent, flexShrink: 0 }}>
                {i + 1}
              </span>
              <span style={{ color: '#ccc', fontSize: 13 }}>|</span>
              <span onClick={() => openCatalog(item.slug, item.label)}
                style={{ fontSize: 13, color: '#1c1c1c', flex: 1, cursor: 'pointer',
                  textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: '#bbb' }}>
                {item.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {catalogSlug && (
        <SetCatalogPanel
          brandKey={null}
          setSlug={catalogSlug}
          accentOverride={accent}
          titleOverride={catalogTitle}
          onClose={() => setCatalog(null)}
        />
      )}
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function btn(bg, color, bold) {
  return { padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: bg, color, fontWeight: bold ? 700 : 500, fontSize: 13, whiteSpace: 'nowrap' };
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AdminSets() {
  const [sets, setSets]     = useState({});
  const [loading, setLoad]  = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  // Читаем brand и set из URL
  const urlBrand = searchParams.get('brand');
  const urlSet = searchParams.get('set');

  function handleOpenCatalog(brand, set) {
    setSearchParams({ brand, set });
  }

  function handleCloseCatalog() {
    setSearchParams({});
  }

  useEffect(() => {
    const dynamicBrands = Object.entries(BRAND_META).filter(([, m]) => !m.staticSets);
    Promise.all(
      dynamicBrands.map(([k]) =>
        adminGetFacets({ brand: k }).then(r => [k, r.data.sets.filter(s => !EXCLUDE.has(s))])
      )
    ).then(res => { setSets(Object.fromEntries(res)); setLoad(false); });
  }, []);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>Линейки сетов</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>Каталог товаров по брендам и сетам</div>
      </div>
      {loading
        ? <div style={{ color: '#aaa', fontSize: 14 }}>Загрузка…</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(BRAND_META).map(([key, meta]) => {
              const baseSets = meta.staticSets || sets[key] || [];
              const allSets  = key === 'matkasym-home'
                ? [...baseSets, ...PROCHIYE.map(p => p.slug)]
                : baseSets;
              return (
                <BrandSection
                  key={key}
                  brandKey={key}
                  sets={allSets}
                  accent={meta.accent}
                  subItems={SET_SUB_ITEMS}
                  autoOpenSet={urlBrand === key ? urlSet : null}
                  onOpenCatalog={handleOpenCatalog}
                  onCloseCatalog={handleCloseCatalog}
                />
              );
            })}
          </div>
        )
      }
    </div>
  );
}
