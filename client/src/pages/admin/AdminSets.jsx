import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  adminGetFacets, adminGetProducts,
  adminGetFrontmen, adminCreateFrontman, adminUpdateFrontman, adminDeleteFrontman,
  adminCatalogPdf,
} from '../../api';

// ── constants ──────────────────────────────────────────────────────────────────

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
};

const EXCLUDE = new Set(['nelikvid', 'samples', 'small-batch', 'misc', 'equipment', 'other']);

const PROCHIYE = [
  { slug: 'nelikvid',    label: 'Неликвид' },
  { slug: 'samples',     label: 'Образцы' },
  { slug: 'small-batch', label: 'Малосерийные' },
  { slug: 'misc',        label: 'Разное' },
  { slug: 'equipment',   label: 'Оборудование и сырьё' },
  { slug: 'other',       label: 'Прочее' },
];

const PRODUCT_STATUS_META = {
  for_sale:       { label: 'В продаже',           color: '#2d7a3a', bg: '#e8f5e9' },
  planned:        { label: 'В плане',             color: '#3b5bdb', bg: '#e8eeff' },
  in_development: { label: 'В разработке',        color: '#7c3aed', bg: '#f3e8ff' },
  improvement:    { label: 'На улучшении',        color: '#c47a00', bg: '#fff3cd' },
  discontinued:   { label: 'Снят с производства', color: '#888',    bg: '#f5f5f5' },
};

const BRAND_META = {
  'matkasym-home':   { label: 'HOME',   accent: '#DC1E24' },
  'matkasym-shaar':  { label: 'SHAAR',  accent: '#3463A3' },
  'matkasym-kyzmat': { label: 'KYZMAT', accent: '#267846',
    staticSets: ['önügüü-set', 'dayar-tütük'] },
};

const SET_SUB_ITEMS = {
  'önügüü-set':  ['Лазер', 'Гибка', 'Сварка', 'Труборез', 'Покраска'],
  'dayar-tütük': ['Трубопрокат'],
};

const PALETTE = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E'];

function toTitle(slug) {
  return SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// returns array of fmIds assigned to this slug
function buildAssignMap(frontmen) {
  const m = {};
  frontmen.forEach(fm => fm.sets.forEach(s => {
    m[s] = m[s] ? [...m[s], fm._id] : [fm._id];
  }));
  return m;
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

function BrandSection({ brandKey, sets, accent, subItems = {} }) {
  const [frontmen, setFrontmen]   = useState([]);
  const [editing, setEditing]     = useState(false);
  const [draft, setDraft]         = useState([]);
  const [saving, setSaving]       = useState(false);
  const [catalogSlug, setCatalog] = useState(null);
  const containerRef = useRef();
  const setRefs      = useRef({});
  const fmRefs       = useRef({});
  const [lines, setLines] = useState([]);
  const linesSig     = useRef('');
  const isMobile     = useIsMobile();

  const loadFrontmen = useCallback(() => {
    adminGetFrontmen(brandKey).then(r => setFrontmen(r.data));
  }, [brandKey]);

  useEffect(() => { loadFrontmen(); }, [loadFrontmen]);

  const assignMap = buildAssignMap(frontmen);

  // ── SVG lines ─────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!containerRef.current || editing || isMobile) {
      if (linesSig.current !== '__clear__') { linesSig.current = '__clear__'; setLines([]); }
      return;
    }
    const base = containerRef.current.getBoundingClientRect();
    const newLines = [];
    sets.forEach(slug => {
      (assignMap[slug] || []).forEach(fmId => {
        const se = setRefs.current[slug];
        const fe = fmRefs.current[fmId];
        if (!se || !fe) return;
        const sr = se.getBoundingClientRect();
        const fr = fe.getBoundingClientRect();
        const fm = frontmen.find(f => f._id === fmId);
        newLines.push({
          x1: Math.round(sr.right - base.left),
          y1: Math.round(sr.top + sr.height / 2 - base.top),
          x2: Math.round(fr.left - base.left),
          y2: Math.round(fr.top + fr.height / 2 - base.top),
          color: fm?.color || '#aaa',
          key: `${slug}-${fmId}`,
        });
      });
    });
    const sig = JSON.stringify(newLines);
    if (sig !== linesSig.current) { linesSig.current = sig; setLines(newLines); }
  });

  // ── edit helpers ──────────────────────────────────────────
  function startEdit() {
    setDraft(frontmen.map(f => ({ ...f, sets: [...f.sets] })));
    setEditing(true);
  }
  function cancelEdit() { setEditing(false); }

  async function saveEdit() {
    setSaving(true);
    try {
      await Promise.all(draft.map(f =>
        adminUpdateFrontman(f._id, { name: f.name, sets: f.sets, instagram: f.instagram, color: f.color })
      ));
      await loadFrontmen();
      setEditing(false);
    } finally { setSaving(false); }
  }

  async function addFrontman() {
    const color = PALETTE[draft.length % PALETTE.length];
    const res = await adminCreateFrontman({ name: `Фронтмен ${draft.length + 1}`, brand: brandKey, sets: [], color });
    setDraft(d => [...d, { ...res.data, sets: [] }]);
  }

  async function deleteFrontman(id) {
    await adminDeleteFrontman(id);
    setDraft(d => d.filter(f => f._id !== id));
  }

  // toggle one set for one frontman (multi-assign)
  function toggleSetFrontman(slug, fmId) {
    setDraft(d => d.map(f => {
      if (f._id !== fmId) return f;
      return {
        ...f,
        sets: f.sets.includes(slug) ? f.sets.filter(s => s !== slug) : [...f.sets, slug],
      };
    }));
  }

  const activeFrontmen  = editing ? draft : frontmen;
  const activeAssignMap = buildAssignMap(activeFrontmen);

  // ── render ────────────────────────────────────────────────
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
              <button onClick={addFrontman} style={btn('#f0f4ff','#3463A3')}>+ Фронтмен</button>
              <button onClick={cancelEdit}  style={btn('#f5f5f5','#555')}>Отмена</button>
              <button onClick={saveEdit} disabled={saving} style={btn(accent,'#fff',true)}>
                {saving ? '…' : 'Сохранить'}
              </button>
            </>
          ) : (
            <button onClick={startEdit} style={btn('#f5f5f5','#333')}>✏️ Изменить</button>
          )}
        </div>
      </div>

      {/* Body */}
      <div ref={containerRef} style={{ position: 'relative' }}>

        {/* SVG lines — desktop view mode only */}
        {!editing && !isMobile && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            {lines.map(l => (
              <path key={l.key}
                d={`M ${l.x1} ${l.y1} C ${l.x1+40} ${l.y1}, ${l.x2-40} ${l.y2}, ${l.x2} ${l.y2}`}
                stroke={l.color} strokeWidth={1.5} fill="none" strokeOpacity={0.45} strokeDasharray="4 3"
              />
            ))}
          </svg>
        )}

        {/* Layout: edit → stacked; view → grid on desktop */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: editing || isMobile ? '1fr' : '1fr 200px',
          gap: isMobile ? 16 : 28,
          alignItems: 'start',
        }}>

          {/* Sets column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sets.map((slug, i) => {
              const fmIds  = activeAssignMap[slug] || [];
              const colors = fmIds.map(id => activeFrontmen.find(f => f._id === id)?.color).filter(Boolean);
              const even   = i % 2 === 0;
              const borderColor = colors[0] || 'transparent';

              return (
                <div key={slug} ref={el => { setRefs.current[slug] = el; }}
                  style={{ padding: '8px 10px', background: even ? '#f8f9fb' : '#fff',
                    borderRadius: 6, borderLeft: `3px solid ${colors.length ? borderColor : 'transparent'}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 20, textAlign: 'right', fontWeight: 700, fontSize: 12, color: accent, flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <span style={{ color: '#ccc', fontSize: 13 }}>|</span>
                    <span
                      onClick={() => !editing && setCatalog(slug)}
                      style={{ fontSize: 13, color: '#1c1c1c', flex: 1, minWidth: 0,
                        cursor: editing ? 'default' : 'pointer',
                        textDecoration: editing ? 'none' : 'underline',
                        textDecorationStyle: 'dotted', textDecorationColor: '#bbb',
                      }}
                    >{toTitle(slug)}</span>

                    {/* View mode: color dots for each assigned frontman */}
                    {!editing && colors.length > 0 && (
                      <div style={{ display: 'flex', gap: 3 }}>
                        {colors.map((c, ci) => (
                          <div key={ci} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Edit mode: toggle pills per frontman */}
                  {editing && draft.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6, paddingLeft: 30 }}>
                      {draft.map(fm => {
                        const active = fm.sets.includes(slug);
                        return (
                          <button key={fm._id} onClick={() => toggleSetFrontman(slug, fm._id)}
                            style={{
                              padding: '3px 9px', borderRadius: 20, cursor: 'pointer',
                              border: `1.5px solid ${fm.color}`,
                              background: active ? fm.color : 'transparent',
                              color: active ? '#fff' : fm.color,
                              fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                            }}>
                            {fm.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Sub-items (e.g. KYZMAT) */}
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
              );
            })}
          </div>

          {/* Frontmen column — view mode (or edit mode for name/color/insta editing) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeFrontmen.map(fm => (
              <div key={fm._id} ref={el => { fmRefs.current[fm._id] = el; }}
                style={{ borderRadius: 8, border: `2px solid ${fm.color}25`,
                  background: `${fm.color}0A`, padding: '10px 12px', position: 'relative' }}
              >
                {/* connector dot */}
                {!isMobile && (
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: fm.color,
                    position: 'absolute', left: -5, top: '50%', transform: 'translateY(-50%)',
                    boxShadow: '0 0 0 2px #fff' }} />
                )}

                {editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="color" value={fm.color} onChange={e => setDraftColor(fm._id, e.target.value)}
                        style={{ width: 22, height: 22, border: 'none', cursor: 'pointer', borderRadius: 4, padding: 0, flexShrink: 0 }} />
                      <input value={fm.name} onChange={e => setDraftName(fm._id, e.target.value)}
                        style={{ flex: 1, fontSize: 13, fontWeight: 700, border: '1px solid #e0e0e0',
                          borderRadius: 4, padding: '4px 8px', minWidth: 0 }} />
                      <button onClick={() => deleteFrontman(fm._id)}
                        style={{ color: '#c00', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
                    </div>
                    <input value={fm.instagram || ''} onChange={e => setDraftInsta(fm._id, e.target.value)}
                      placeholder="@instagram"
                      style={{ fontSize: 11, border: '1px solid #e8e8e8', borderRadius: 4, padding: '3px 8px', color: '#888' }} />
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1c1c1c' }}>{fm.name}</div>
                    {fm.instagram && <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{fm.instagram}</div>}
                    <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {fm.sets.map(s => (
                        <div key={s} style={{ fontSize: 11, color: fm.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 4, height: 4, borderRadius: '50%', background: fm.color, flexShrink: 0, display: 'inline-block' }} />
                          {toTitle(s)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}

            {!editing && frontmen.length === 0 && (
              <div style={{ fontSize: 12, color: '#ccc', textAlign: 'center', padding: '16px 0' }}>Нет фронтменов</div>
            )}
          </div>
        </div>
      </div>

      {/* Catalog panel overlay */}
      {catalogSlug && (
        <SetCatalogPanel brandKey={brandKey} setSlug={catalogSlug} onClose={() => setCatalog(null)} />
      )}
    </div>
  );

  function setDraftName (id, v) { setDraft(d => d.map(f => f._id===id ? {...f,name:v}    : f)); }
  function setDraftInsta(id, v) { setDraft(d => d.map(f => f._id===id ? {...f,instagram:v}: f)); }
  function setDraftColor(id, v) { setDraft(d => d.map(f => f._id===id ? {...f,color:v}   : f)); }
}

// ── ProductDetailModal ────────────────────────────────────────────────────────

function ProductDetailModal({ product, onClose }) {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();
  const canEdit   = user?.role === 'owner' || user?.role === 'editor';
  const [imgIdx, setImgIdx] = useState(0);

  const images = (product.images || []).filter(Boolean);
  const img    = images[imgIdx] || NO_PHOTO;

  const prices = [
    { label: 'Розничная',     value: product.price },
    { label: 'Оптовая',       value: product.priceWholesale },
    { label: 'Дилерская',     value: product.priceDealer },
    { label: 'Себестоимость', value: product.priceCost },
  ].filter(p => p.value > 0);

  const statusMeta = PRODUCT_STATUS_META[product.productStatus];
  const stockLabel  = product.stock > 0 ? `${product.stock} шт.` : (product.inStock ? 'Есть' : 'Нет');

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft'  && images.length > 1) setImgIdx(i => (i - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight' && images.length > 1) setImgIdx(i => (i + 1) % images.length);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [images.length, onClose]);

  // Prevent body scroll bleed
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <>
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1200 }} />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 1201,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 24, pointerEvents: 'none',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: isMobile ? 0 : 16,
          width: '100%', maxWidth: 900,
          maxHeight: isMobile ? '100%' : '92vh',
          height: isMobile ? '100%' : 'auto',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          pointerEvents: 'auto',
        }}>

          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Карточка товара
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {canEdit && (
                <button onClick={() => navigate(`/admin/products/${product._id}/edit`)}
                  style={{ padding: '7px 16px', borderRadius: 8, background: '#111', color: '#fff',
                    border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  ✏️ Редактировать
                </button>
              )}
              <button onClick={onClose}
                style={{ width: 32, height: 32, borderRadius: 8, background: '#f5f5f5',
                  border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: '32px', textAlign: 'center' }}>
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{
            flex: 1, minHeight: 0, overflow: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            display: isMobile ? 'block' : 'grid', gridTemplateColumns: '1fr 1fr',
          }}>

            {/* Image gallery */}
            <div style={{ background: '#f5f5f7', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, position: 'relative', minHeight: isMobile ? 280 : 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={img} alt={product.name}
                  style={{ maxWidth: '100%', maxHeight: isMobile ? 280 : 380, objectFit: 'contain', display: 'block', padding: 16 }}
                  onError={e => { e.target.src = NO_PHOTO; }}
                />
                {images.length > 1 && (
                  <>
                    <button onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                      style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(0,0,0,.35)', color: '#fff', border: 'none', borderRadius: 8,
                        width: 36, height: 36, fontSize: 20, cursor: 'pointer', lineHeight: '36px', textAlign: 'center' }}>
                      ‹
                    </button>
                    <button onClick={() => setImgIdx(i => (i + 1) % images.length)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(0,0,0,.35)', color: '#fff', border: 'none', borderRadius: 8,
                        width: 36, height: 36, fontSize: 20, cursor: 'pointer', lineHeight: '36px', textAlign: 'center' }}>
                      ›
                    </button>
                    <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                      fontSize: 11, color: '#999', background: 'rgba(255,255,255,.8)', borderRadius: 10, padding: '2px 8px' }}>
                      {imgIdx + 1} / {images.length}
                    </div>
                  </>
                )}
              </div>
              {images.length > 1 && (
                <div style={{ display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto', background: '#eee', flexShrink: 0 }}>
                  {images.map((src, i) => (
                    <img key={i} src={src} alt=""
                      onClick={() => setImgIdx(i)}
                      style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                        border: i === imgIdx ? '2px solid #333' : '2px solid transparent',
                        opacity: i === imgIdx ? 1 : 0.6 }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {statusMeta && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    background: statusMeta.bg, color: statusMeta.color }}>
                    {statusMeta.label}
                  </span>
                )}
                {product.isNew && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: '#fff3cd', color: '#856404' }}>
                    Новинка
                  </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                  background: product.inStock ? '#e8f5e9' : '#fce8e8',
                  color: product.inStock ? '#2d7a3a' : '#c00' }}>
                  {stockLabel}
                </span>
              </div>

              {/* Title */}
              <div>
                <div style={{ fontSize: isMobile ? 16 : 19, fontWeight: 800, color: '#111', lineHeight: 1.25 }}>
                  {product.fullName || product.name}
                </div>
                {product.fullName && product.name !== product.fullName && (
                  <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>{product.name}</div>
                )}
                {product.sku && <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>SKU: {product.sku}</div>}
              </div>

              {/* Prices */}
              {prices.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Цены
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                    {prices.map(p => (
                      <div key={p.label} style={{ background: '#f8f8f8', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600 }}>{p.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>
                          {p.value.toLocaleString('ru')} сом
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Specs */}
              {product.specs?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Характеристики
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {product.specs.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, paddingBottom: 5,
                        borderBottom: '1px solid #f5f5f5' }}>
                        <span style={{ color: '#aaa', minWidth: 110, flexShrink: 0 }}>{s.key}</span>
                        <span style={{ color: '#1c1c1c', fontWeight: 600 }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {product.description && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Описание
                  </div>
                  <div style={{ fontSize: 13, color: '#555', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {product.description}
                  </div>
                </div>
              )}

              {/* Dimensions */}
              {product.dimensions && (
                <div style={{ fontSize: 13, color: '#888' }}>
                  <span style={{ color: '#bbb' }}>Габариты:</span> {product.dimensions}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── SetCatalogPanel ───────────────────────────────────────────────────────────

const RETAIL_BRANDS = new Set(['matkasym-home', 'matkasym-shaar']);
const NO_PHOTO      = '/logos/no-photo.png';

const PRICE_MODES = [
  { key: 'retail',     label: 'Розничная',  short: 'Розн.' },
  { key: 'wholesale',  label: 'Оптовая',    short: 'Опт.'  },
  { key: 'dealer',     label: 'Дилерская',  short: 'Дил.'  },
  { key: 'none',       label: 'Без цен',    short: 'Без'   },
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

async function downloadCatalogPdf(products, priceMode, setTitle, brandLabel, accent) {
  const blob = await adminCatalogPdf({ products, priceMode, setTitle, brandLabel, accent })
    .then(r => r.data);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${brandLabel}_${setTitle}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function SetCatalogPanel({ brandKey, setSlug, onClose, accentOverride, titleOverride }) {
  const accent      = accentOverride || BRAND_META[brandKey]?.accent || '#555';
  const defaultMode = RETAIL_BRANDS.has(brandKey) ? 'retail' : 'retail';
  const [priceMode, setPriceMode]         = useState(defaultMode);
  const [pdfMode,   setPdfMode]           = useState(defaultMode);
  const [showPdfOpts, setShowPdf]         = useState(false);
  const [products,  setProducts]          = useState([]);
  const [loading,   setLoading]           = useState(true);
  const [pdfLoading, setPdfLoading]       = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const isMobile = useIsMobile();

  // Lock body scroll while panel is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    setLoading(true);
    adminGetProducts({
      ...(brandKey ? { brand: brandKey } : {}),
      set: setSlug, limit: 500, page: 1,
    })
      .then(r => { setProducts(r.data.products || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [brandKey, setSlug]);

  const grouped = {};
  products.forEach(p => {
    if (!grouped[p.name]) grouped[p.name] = [];
    grouped[p.name].push(p);
  });
  const models = Object.entries(grouped);

  async function handleDownload() {
    setPdfLoading(true);
    setShowPdf(false);
    try {
      await downloadCatalogPdf(products, pdfMode, toTitle(setSlug), BRAND_META[brandKey]?.label || '', accent);
    } finally { setPdfLoading(false); }
  }

  const priceLabel = getPriceLabel(priceMode);

  // On desktop — full screen (covers sidebar too); on mobile — full screen
  const panelStyle = {
    position: 'fixed', inset: 0,
    background: '#f7f8fa', zIndex: 1500,
    display: 'flex', flexDirection: 'column',
  };

  return (
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

          {/* PDF button */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setShowPdf(s => !s)} disabled={pdfLoading}
              style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${accent}`,
                background: 'transparent', color: accent, fontWeight: 700, fontSize: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              {pdfLoading ? '⏳' : '⬇'} PDF
            </button>
            {showPdfOpts && (
              <div onClick={e => e.stopPropagation()}
                style={{ position: 'absolute', top: '110%', right: 0, background: '#fff',
                  border: '1px solid #eee', borderRadius: 10,
                  boxShadow: '0 4px 24px rgba(0,0,0,.14)',
                  padding: 14, zIndex: 10, minWidth: 210 }}>
                <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, marginBottom: 8 }}>Цены в PDF:</div>
                {PRICE_MODES.map(m => (
                  <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 4px', cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="pdfMode" value={m.key}
                      checked={pdfMode === m.key} onChange={() => setPdfMode(m.key)} />
                    {m.label}
                  </label>
                ))}
                <button onClick={handleDownload}
                  style={{ marginTop: 10, width: '100%', padding: '8px', borderRadius: 7,
                    background: accent, color: '#fff', border: 'none', fontWeight: 700,
                    fontSize: 13, cursor: 'pointer' }}>
                  Скачать PDF
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Product grid — scrollable */}
        <div style={{
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
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? 'repeat(2, 1fr)'
                : 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: isMobile ? 10 : 16,
            }}>
              {models.map(([name, variants]) => {
                const primary    = variants[0];
                const img        = primary.images?.[0] || NO_PHOTO;
                const price      = getPrice(primary, priceMode);
                const hasStock   = primary.stock > 0 || primary.inStock;
                const stockLabel = primary.stock > 0
                  ? `${primary.stock} шт.`
                  : (primary.inStock ? 'Есть' : 'Нет');
                return (
                  <div key={name}
                    onClick={() => setDetailProduct(primary)}
                    style={{
                      border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden',
                      background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                      cursor: 'pointer', transition: 'box-shadow .15s, transform .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)';  e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#f8f8f8' }}>
                      <img src={img} alt={name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => { e.target.src = NO_PHOTO; }}
                      />
                    </div>
                    <div style={{ padding: '10px 11px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111', lineHeight: 1.3,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {name}
                      </div>
                      {variants.length > 1 && (
                        <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                          {variants.length} вариантов
                        </div>
                      )}
                      {primary.specs?.slice(0, 2).map(s => (
                        <div key={s.key} style={{ fontSize: 10, color: '#888', marginTop: 2, lineHeight: 1.2 }}>
                          <span style={{ color: '#bbb' }}>{s.key}:</span> {s.value}
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                        <div>
                          <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, lineHeight: 1 }}>
                            {priceLabel}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: accent, lineHeight: 1.2 }}>
                            {price > 0 ? `${price.toLocaleString('ru')} сом` : '—'}
                          </div>
                        </div>
                        <div style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
                          background: hasStock ? '#e8f5e9' : '#fce8e8',
                          color:      hasStock ? '#2d7a3a' : '#c00',
                        }}>
                          {stockLabel}
                        </div>
                      </div>
                      {primary.sku && (
                        <div style={{ fontSize: 9, color: '#ccc', marginTop: 2 }}>{primary.sku}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Product detail modal */}
      {detailProduct && (
        <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} />
      )}
    </>
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
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>Товары и фронтмены</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>Линейки по брендам, фронтмены и каталог товаров</div>
      </div>
      {loading
        ? <div style={{ color: '#aaa', fontSize: 14 }}>Загрузка…</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(BRAND_META).map(([key, meta]) => (
              <BrandSection
                key={key}
                brandKey={key}
                sets={meta.staticSets || sets[key] || []}
                accent={meta.accent}
                subItems={SET_SUB_ITEMS}
              />
            ))}
            <ProchiyeSection />
          </div>
        )
      }
    </div>
  );
}
