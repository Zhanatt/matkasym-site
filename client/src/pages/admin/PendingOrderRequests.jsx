import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  adminGetProductRequests,
  adminGetMyProductRequests,
  adminCreateProductRequest,
  adminDeleteProductRequest,
  adminGetProducts,
} from '../../api';

const CLOUD = 'dnbg21ef8';
const PRESET = 'Matkasym';
const NO_PHOTO = '/logos/no-photo.png';

const TYPE_META = {
  new:     { label: 'Новый',      icon: '🆕', color: '#1d4ed8', bg: '#eff6ff' },
  catalog: { label: 'С каталога', icon: '🛒', color: '#b45309', bg: '#fef3c7' },
  test:    { label: 'Тест',       icon: '🧪', color: '#00838f', bg: '#e0f7fa' },
  real:    { label: 'Заказ',      icon: '🛒', color: '#b45309', bg: '#fef3c7' },
};

const TYPES = [
  { key: 'new',     icon: '🆕', title: 'Новый товар',       desc: 'Заполнить форму нового товара', accent: '#2563eb', bg: '#eff6ff' },
  { key: 'catalog', icon: '🛒', title: 'Заказать с каталога', desc: 'Выбрать товар из каталога',   accent: '#b45309', bg: '#fef3c7' },
];

const BRAND_LABELS = { 'matkasym-home': 'HOME', 'matkasym-shaar': 'SHAAR', 'matkasym-kyzmat': 'KYZMAT' };

const SET_NAMES = {
  'önügüü-set': 'Onuguu Set', 'dayar-tütük': 'Dayar Tutuk', 'achyk-asman': 'Achyk Asman',
  'den-sooluk': 'Den Sooluk', 'zhashyl-ömür': 'Zhashyl Omur', 'jenil-ashkana': 'Jenil Ashkana',
  'konok-keldi': 'Konok Keldi', 'korkom-aiym': 'Korkom Aiym', 'kosh-keliniz': 'Kosh Keliniz',
  'onoi-sakta': 'Onoi Sakta', 'baary-oorunda': 'Baary Oorunda', 'sanarip-tv': 'Sanarip TV',
  'shirin-balalyk': 'Shirin Balalyk', 'taza-kiym': 'Taza Kiym', 'uydo-ishtoo': 'Uydo Ishtoo',
  'mazza-seiyl': 'Mazza Seiyl', 'zhashyl-omur-shaar': 'Zhashyl Omur (Shaar)', '0-tashtandy': '0-Tashtandy',
  'bekem-fasad': 'Bekem Fasad', 'bilim-kelechek': 'Bilim Kelechek', 'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'uzak-koldon': 'Uzak Koldon', 'samples': 'Obraztsy', 'small-batch': 'Malaya Partiya',
  'misc': 'Raznoe', 'equipment': 'Oborudovanie', 'other': 'Prochee',
};
const setLabel = (slug) => SET_NAMES[slug] || (slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '');
const brandLabel = (b) => BRAND_LABELS[b] || b || '';
const isBelowBuffer = (p) => (p.bufferStock || 0) > 0 && (p.stock || 0) < (p.bufferStock || 0);

const selectStyle = {
  flex: 1, minWidth: 0, fontSize: 14, padding: '10px 12px', border: '1.5px solid #e2e8f0',
  borderRadius: 10, outline: 'none', background: '#fff', cursor: 'pointer',
};

const label = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
const input = {
  width: '100%', fontSize: 16, padding: '12px 14px', border: '1.5px solid #e2e8f0',
  borderRadius: 12, outline: 'none', boxSizing: 'border-box', background: '#fff',
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PendingOrderRequests({ onCountChange }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoad]  = useState(true);
  const [gallery, setGallery] = useState(null); // { photos, i }
  const [detail, setDetail] = useState(null);   // заявка для попапа "подробнее"
  const [deleting, setDeleting] = useState(null); // id удаляемой заявки

  // create form state
  const [open, setOpen]         = useState(false);
  const [type, setType]         = useState('');
  const [photos, setPhotos]     = useState([]);
  const [uploading, setUpload]  = useState(false);
  const [name, setName]         = useState('');
  const [quantity, setQuantity] = useState('');
  const [height, setHeight]     = useState('');
  const [width, setWidth]       = useState('');
  const [depth, setDepth]       = useState('');
  const [color, setColor]       = useState('');
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState('');
  const fileRef = useRef(null);

  // catalog picker state
  const [catQuery, setCatQuery]   = useState('');
  const [allProducts, setAllProducts] = useState([]);
  const [catLoading, setCatLoad]  = useState(false);
  const [brandFilter, setBrand]   = useState('');
  const [setFilter, setSet]       = useState('');
  const [ikeaFilter, setIkea]     = useState(''); // '' | 'ikea' | 'noikea'
  const [picked, setPicked]       = useState(null); // выбранный товар из каталога

  const load = useCallback(() => {
    setLoad(true);
    // Владелец / Джипар видят все активные заявки; остальные — свои
    adminGetProductRequests({ status: 'active' })
      .then(r => {
        const list = r.data.requests || [];
        setItems(list);
        onCountChange?.(r.data.activeCount ?? list.length);
      })
      .catch(() =>
        adminGetMyProductRequests()
          .then(r => {
            const list = (r.data.requests || []).filter(x => x.status !== 'done');
            setItems(list);
            onCountChange?.(list.length);
          })
          .catch(() => { setItems([]); onCountChange?.(0); })
      )
      .finally(() => setLoad(false));
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const removeRequest = async (id) => {
    if (!window.confirm('Заявка будет снята. Удалить её?')) return;
    setDeleting(id);
    try {
      await adminDeleteProductRequest(id);
      setDetail(null);
      load();
    } catch (e) {
      alert(e?.response?.data?.error || 'Не удалось удалить заявку');
    } finally {
      setDeleting(null);
    }
  };

  // Один раз загружаем весь каталог, когда выбран тип "catalog"
  useEffect(() => {
    if (!open || type !== 'catalog' || allProducts.length) return;
    setCatLoad(true);
    adminGetProducts({ limit: 2000, sort: 'newest' })
      .then(r => setAllProducts(r.data.products || []))
      .catch(() => setAllProducts([]))
      .finally(() => setCatLoad(false));
  }, [open, type, allProducts.length]);

  // Опции брендов/сетов из загруженного каталога
  const brandOptions = useMemo(
    () => [...new Set(allProducts.map(p => p.brand).filter(Boolean))].sort(),
    [allProducts]
  );
  const setOptions = useMemo(
    () => [...new Set(allProducts
      .filter(p => !brandFilter || p.brand === brandFilter)
      .map(p => p.set).filter(Boolean))].sort((a, b) => setLabel(a).localeCompare(setLabel(b), 'ru')),
    [allProducts, brandFilter]
  );

  // Фильтрация + сортировка: ниже буфера — наверх (по величине нехватки)
  const catList = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    const filtered = allProducts.filter(p => {
      if (brandFilter && p.brand !== brandFilter) return false;
      if (setFilter && p.set !== setFilter) return false;
      if (ikeaFilter === 'ikea'   && p.supplier?.company !== 'IKEA') return false;
      if (ikeaFilter === 'noikea' && p.supplier?.company === 'IKEA') return false;
      if (q) {
        const hay = `${p.fullName || ''} ${p.name || ''} ${p.sku || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const deficit = (p) => isBelowBuffer(p) ? (p.bufferStock || 0) - (p.stock || 0) : -1;
    return filtered.sort((a, b) => {
      const da = deficit(a), db = deficit(b);
      if (da >= 0 && db < 0) return -1;   // a ниже буфера, b нет
      if (db >= 0 && da < 0) return 1;
      if (da >= 0 && db >= 0) return db - da; // оба ниже буфера — сильнее нехватка выше
      return (a.fullName || a.name || '').localeCompare(b.fullName || b.name || '', 'ru');
    });
  }, [allProducts, brandFilter, setFilter, ikeaFilter, catQuery]);

  const reset = () => {
    setType(''); setPhotos([]); setName(''); setQuantity('');
    setHeight(''); setWidth(''); setDepth(''); setColor(''); setNote(''); setError('');
    setCatQuery(''); setBrand(''); setSet(''); setIkea(''); setPicked(null);
  };

  const openForm = () => { reset(); setOpen(true); document.body.style.overflow = 'hidden'; };
  const closeForm = () => { setOpen(false); reset(); document.body.style.overflow = ''; };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUpload(true); setError('');
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', PRESET);
        fd.append('folder', 'matkasym/product-requests');
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.secure_url) setPhotos(prev => [...prev, data.secure_url]);
        else setError(data.error?.message || 'Не удалось загрузить фото');
      } catch { setError('Ошибка загрузки фото'); }
    }
    setUpload(false);
    e.target.value = '';
  };

  const submit = async () => {
    if (!type) return setError('Выберите тип заявки');

    let payload;
    if (type === 'catalog') {
      if (!picked) return setError('Выберите товар из каталога');
      const img = picked.images?.[0] || '';
      payload = {
        type: 'catalog',
        product: picked._id,
        sku: picked.sku || '',
        name: picked.fullName || picked.name || '',
        color: picked.color || '',
        photo: img,
        photos: img ? [img] : [],
        quantity: quantity || undefined,
        note,
      };
    } else {
      if (!name.trim()) return setError('Укажите название товара');
      const dims = [height, width, depth].map(s => String(s).trim()).filter(Boolean);
      const dimensions = dims.length ? dims.join('×') + ' см' : '';
      payload = { type: 'new', photos, photo: photos[0] || '', name, quantity: quantity || undefined, dimensions, color, note };
    }

    setSaving(true); setError('');
    try {
      await adminCreateProductRequest(payload);
      setToast('Заявка на заказ отправлена ✓');
      setTimeout(() => setToast(''), 3000);
      closeForm();
      load();
    } catch (e) {
      setError(e?.response?.data?.error || 'Ошибка при отправке');
    }
    setSaving(false);
  };

  return (
    <div>
      <style>{`@media(max-width:640px){.por-card{flex-direction:column!important;align-items:stretch!important}.por-photo{width:100%!important;height:190px!important}}`}</style>

      {/* Инфо */}
      <div style={{
        background: '#fef2f2', padding: '12px 16px', borderRadius: 10, marginBottom: 16,
        fontSize: 13, color: '#b3161b',
      }}>
        📥 Заявки на заказ товара. Создайте заявку — её обработает Джипар.
      </div>

      {toast && (
        <div style={{ background: '#e8f5e9', color: '#2d7a3a', border: '1px solid #a5d6a7',
          borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontWeight: 600, fontSize: 14 }}>
          {toast}
        </div>
      )}

      {/* Кнопка создания */}
      <button onClick={openForm}
        style={{ width: '100%', padding: '16px', fontSize: 16, fontWeight: 700, color: '#fff',
          background: 'linear-gradient(135deg, #DC1E24 0%, #b3161b 100%)', border: 'none',
          borderRadius: 14, cursor: 'pointer', boxShadow: '0 6px 18px rgba(220,30,36,.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>＋</span> Новая заявка на заказ
      </button>

      {/* Список заявок */}
      {loading ? (
        <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>Загрузка…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, background: '#f9f9f9', borderRadius: 16, color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📥</div>
          <div style={{ fontSize: 15 }}>Нет активных заявок на заказ</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(r => {
            const t = TYPE_META[r.type] || TYPE_META.real;
            const pics = r.photos?.length ? r.photos : (r.photo ? [r.photo] : []);
            return (
              <div key={r._id} className="por-card" onClick={() => setDetail(r)}
                style={{ position: 'relative', display: 'flex', gap: 14, background: '#fff',
                  border: '1.5px solid #fde68a', borderRadius: 12, padding: 14, cursor: 'pointer',
                  transition: 'box-shadow .15s, border-color .15s' }}
                onMouseOver={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor = '#f59e0b'; }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#fde68a'; }}>
                {/* Крестик удаления */}
                <button onClick={(e) => { e.stopPropagation(); removeRequest(r._id); }} disabled={deleting === r._id}
                  title="Снять заявку"
                  style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8,
                    border: 'none', background: '#fdecea', color: '#c0392b', fontSize: 15, lineHeight: 1,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  {deleting === r._id ? '…' : '✕'}
                </button>
                <div className="por-photo"
                  style={{ position: 'relative', width: 92, height: 92, flexShrink: 0, borderRadius: 10, overflow: 'hidden',
                    background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {pics[0] ? <img src={pics[0]} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                           : <span style={{ fontSize: 30 }}>{t.icon}</span>}
                  {pics.length > 1 && (
                    <span style={{ position: 'absolute', bottom: 5, right: 5, background: 'rgba(0,0,0,.65)',
                      color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 12 }}>
                      +{pics.length - 1}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.color, background: t.bg,
                      padding: '2px 8px', borderRadius: 20 }}>{t.icon} {t.label}</span>
                    <span style={{ fontSize: 11, color: '#b0b8c1' }}>№{r.number}</span>
                    {r.sku && <span style={{ fontSize: 11, color: '#94a3b8' }}>· {r.sku}</span>}
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309' }}>⏳ Ждёт обработки</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '6px 0 4px' }}>{r.name}</div>
                  <div style={{ fontSize: 13, color: '#5b6572', lineHeight: 1.5 }}>
                    {r.quantity ? <span style={{ marginRight: 12, fontWeight: 700, color: '#b45309' }}>📦 {r.quantity} шт</span> : null}
                    {r.dimensions && <span style={{ marginRight: 12 }}>📐 {r.dimensions}</span>}
                    {r.color && <span>🎨 {r.color}</span>}
                  </div>
                  {r.note && <div style={{ fontSize: 13, color: '#5b6572', marginTop: 4, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>💬 {r.note}</div>}
                  <div style={{ fontSize: 11.5, color: '#9aa5b1', marginTop: 8 }}>
                    👤 {r.createdBy?.name || r.createdByName || 'фронтмен'} · 🕐 {fmtDate(r.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модалка создания заявки */}
      {open && createPortal(
        <>
          <div onClick={closeForm} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1600 }} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 1601, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
            <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560,
              maxHeight: '92vh', overflow: 'auto', padding: 22, pointerEvents: 'auto',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
              <style>{`@media (max-width: 640px) { .por-types { grid-template-columns: 1fr !important; } }`}</style>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: '#111' }}>📥 Новая заявка на заказ</div>
                <button onClick={closeForm} style={{ width: 34, height: 34, borderRadius: 10,
                  background: '#f5f5f5', border: 'none', fontSize: 17, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Тип */}
              <div style={label}>Тип заявки</div>
              <div className="por-types" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                {TYPES.map(t => {
                  const sel = type === t.key;
                  return (
                    <div key={t.key} onClick={() => { setType(t.key); setError(''); }}
                      style={{ cursor: 'pointer', borderRadius: 14, padding: '14px 12px', textAlign: 'center',
                        border: `2px solid ${sel ? t.accent : '#eceff3'}`, background: sel ? t.bg : '#fafbfc',
                        boxShadow: sel ? `0 4px 12px ${t.accent}22` : 'none' }}>
                      <div style={{ fontSize: 28, lineHeight: 1 }}>{t.icon}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1c1c', marginTop: 6 }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: '#8a97a5', marginTop: 2 }}>{t.desc}</div>
                    </div>
                  );
                })}
              </div>

              {/* ── НОВЫЙ ТОВАР: форма заполнения ── */}
              {type === 'new' && (
                <>
                  <div style={label}>Фото товара {photos.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}>({photos.length})</span>}</div>
                  <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} style={{ display: 'none' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8, marginBottom: 18 }}>
                    {photos.map((url, i) => (
                      <div key={url + i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: '1px solid #eceff3' }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.6)', color: '#fff',
                            border: 'none', borderRadius: 16, width: 24, height: 24, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
                      </div>
                    ))}
                    <div onClick={() => !uploading && fileRef.current?.click()}
                      style={{ aspectRatio: '1', border: '2px dashed #d3dae3', borderRadius: 10, display: 'flex',
                        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        background: '#fafbfc', color: '#7b8794', textAlign: 'center', padding: 6 }}>
                      {uploading ? (
                        <span style={{ color: '#1976d2', fontWeight: 600, fontSize: 12 }}>Загрузка…</span>
                      ) : (
                        <><div style={{ fontSize: 24 }}>📷</div>
                          <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600 }}>Добавить</div></>
                      )}
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={label}>Название товара <span style={{ color: '#DC1E24' }}>*</span></div>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Например: Складной табурет" style={input} />
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={label}>Количество, шт</div>
                    <input inputMode="numeric" value={quantity}
                      onChange={e => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="Например: 10" style={input} />
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={label}>Размеры, см (В×Ш×Г)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} placeholder="В" style={{ ...input, textAlign: 'center', padding: '12px 6px' }} />
                      <span style={{ color: '#c0c8d0', fontWeight: 700, flexShrink: 0 }}>×</span>
                      <input inputMode="decimal" value={width} onChange={e => setWidth(e.target.value)} placeholder="Ш" style={{ ...input, textAlign: 'center', padding: '12px 6px' }} />
                      <span style={{ color: '#c0c8d0', fontWeight: 700, flexShrink: 0 }}>×</span>
                      <input inputMode="decimal" value={depth} onChange={e => setDepth(e.target.value)} placeholder="Г" style={{ ...input, textAlign: 'center', padding: '12px 6px' }} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={label}>Цвет</div>
                    <input value={color} onChange={e => setColor(e.target.value)} placeholder="Синий" style={input} />
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <div style={label}>Дополнительно</div>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                      placeholder="Комментарий, ссылка, количество и т.п. (необязательно)"
                      style={{ ...input, resize: 'vertical' }} />
                  </div>
                </>
              )}

              {/* ── ЗАКАЗАТЬ С КАТАЛОГА: выбор товара ── */}
              {type === 'catalog' && !picked && (
                <>
                  {/* Фильтры: бренд + сет */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <select value={brandFilter} onChange={e => { setBrand(e.target.value); setSet(''); }} style={selectStyle}>
                      <option value="">Все бренды</option>
                      {brandOptions.map(b => <option key={b} value={b}>{brandLabel(b)}</option>)}
                    </select>
                    <select value={setFilter} onChange={e => setSet(e.target.value)} style={selectStyle}>
                      <option value="">Все сеты</option>
                      {setOptions.map(s => <option key={s} value={s}>{setLabel(s)}</option>)}
                    </select>
                  </div>

                  {/* Фильтр IKEA / без IKEA */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {[['', 'Все товары'], ['ikea', '🛒 Только IKEA'], ['noikea', 'Без IKEA']].map(([v, l]) => (
                      <div key={v} onClick={() => setIkea(v)} style={{
                        flex: 1, textAlign: 'center', padding: '8px 10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', border: '1.5px solid ' + (ikeaFilter === v ? '#0058A3' : '#e2e8f0'),
                        background: ikeaFilter === v ? '#eaf3fb' : '#fff', color: ikeaFilter === v ? '#0058A3' : '#475569',
                      }}>{l}</div>
                    ))}
                  </div>

                  <input value={catQuery} onChange={e => setCatQuery(e.target.value)}
                    placeholder="Поиск по названию или артикулу…" style={{ ...input, marginBottom: 6 }} />
                  <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 10 }}>
                    {catLoading ? 'Загрузка каталога…' : `Найдено: ${catList.length} · товары ниже буфера — сверху`}
                  </div>

                  <div style={{ maxHeight: 340, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                    {catLoading ? (
                      <div style={{ color: '#aaa', textAlign: 'center', padding: 24, fontSize: 14 }}>Загрузка…</div>
                    ) : catList.length === 0 ? (
                      <div style={{ color: '#bbb', textAlign: 'center', padding: 24, fontSize: 14 }}>Ничего не найдено</div>
                    ) : catList.map(p => {
                      const low = isBelowBuffer(p);
                      return (
                        <div key={p._id} onClick={() => { setPicked(p); setError(''); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderRadius: 10,
                            border: `1px solid ${low ? '#fecaca' : '#eceff3'}`, cursor: 'pointer',
                            background: low ? '#fff5f5' : '#fff' }}
                          onMouseOver={e => e.currentTarget.style.borderColor = '#DC1E24'}
                          onMouseOut={e => e.currentTarget.style.borderColor = low ? '#fecaca' : '#eceff3'}>
                          <img src={p.images?.[0] || NO_PHOTO} alt="" loading="lazy" onError={e => { e.target.src = NO_PHOTO; }}
                            style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', background: '#f1f5f9', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#111', overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fullName || p.name}</div>
                            <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span>{p.sku}{typeof p.stock === 'number' ? ` · остаток: ${p.stock}` : ''}</span>
                              {low && (
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b91c1c', background: '#fee2e2',
                                  padding: '1px 7px', borderRadius: 20 }}>
                                  ⚠️ ниже буфера ({p.bufferStock})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── ЗАКАЗАТЬ С КАТАЛОГА: товар выбран ── */}
              {type === 'catalog' && picked && (
                <>
                  <div style={label}>Выбранный товар</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12,
                    border: '1.5px solid #fde68a', background: '#fffbeb', marginBottom: 16 }}>
                    <img src={picked.images?.[0] || NO_PHOTO} alt="" onError={e => { e.target.src = NO_PHOTO; }}
                      style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', background: '#f1f5f9', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{picked.fullName || picked.name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        {picked.sku}{typeof picked.stock === 'number' ? ` · остаток: ${picked.stock}` : ''}
                      </div>
                    </div>
                    <button onClick={() => setPicked(null)}
                      style={{ padding: '8px 12px', fontSize: 12.5, fontWeight: 600, color: '#475569',
                        background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}>
                      Изменить
                    </button>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={label}>Количество, шт</div>
                    <input inputMode="numeric" value={quantity}
                      onChange={e => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="Например: 10" style={input} />
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <div style={label}>Комментарий</div>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                      placeholder="Срок, пожелания… (необязательно)"
                      style={{ ...input, resize: 'vertical' }} />
                  </div>
                </>
              )}

              {error && <div style={{ color: '#c00', fontSize: 13, marginBottom: 12 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={closeForm}
                  style={{ flex: '0 0 auto', padding: '14px 18px', fontSize: 15, fontWeight: 600, color: '#555',
                    background: '#f1f5f9', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
                  Отмена
                </button>
                <button onClick={submit} disabled={saving || uploading}
                  style={{ flex: 1, padding: '14px', fontSize: 16, fontWeight: 700, color: '#fff',
                    background: saving ? '#9aa5b1' : '#DC1E24', border: 'none', borderRadius: 12,
                    cursor: saving ? 'default' : 'pointer' }}>
                  {saving ? 'Отправка…' : 'Отправить заявку'}
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Попап "подробнее" */}
      {detail && createPortal(
        <>
          <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1600 }} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 1601, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
            <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 540,
              maxHeight: '92vh', overflow: 'auto', padding: 22, pointerEvents: 'auto',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
              {(() => {
                const t = TYPE_META[detail.type] || TYPE_META.real;
                const pics = detail.photos?.length ? detail.photos : (detail.photo ? [detail.photo] : []);
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.color, background: t.bg,
                          padding: '3px 10px', borderRadius: 20 }}>{t.icon} {t.label}</span>
                        <span style={{ fontSize: 12, color: '#b0b8c1' }}>№{detail.number}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>⏳ Ждёт обработки</span>
                      </div>
                      <button onClick={() => setDetail(null)} style={{ width: 34, height: 34, borderRadius: 10,
                        background: '#f5f5f5', border: 'none', fontSize: 17, cursor: 'pointer', flexShrink: 0 }}>✕</button>
                    </div>

                    <div style={{ fontSize: 20, fontWeight: 800, color: '#111', marginBottom: 14 }}>{detail.name}</div>

                    {/* Фото-галерея */}
                    {pics.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 16 }}>
                        {pics.map((url, i) => (
                          <img key={url + i} src={url} alt="" onClick={() => setGallery({ photos: pics, i })}
                            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10,
                              border: '1px solid #eceff3', cursor: 'zoom-in' }} />
                        ))}
                      </div>
                    )}

                    {/* Характеристики */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {[
                        detail.quantity ? ['📦 Количество', `${detail.quantity} шт`] : null,
                        detail.sku ? ['🏷 Артикул', detail.sku] : null,
                        detail.dimensions ? ['📐 Размеры', detail.dimensions] : null,
                        detail.color ? ['🎨 Цвет', detail.color] : null,
                      ].filter(Boolean).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', gap: 10, fontSize: 14 }}>
                          <span style={{ color: '#94a3b8', minWidth: 130 }}>{k}</span>
                          <span style={{ color: '#111', fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                      {detail.note && (
                        <div style={{ fontSize: 14, color: '#374151', background: '#f8fafc', borderRadius: 10, padding: 12 }}>
                          💬 {detail.note}
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: 12.5, color: '#9aa5b1', marginBottom: 18, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                      👤 Автор: <b style={{ color: '#5b6572' }}>{detail.createdBy?.name || detail.createdByName || 'фронтмен'}</b>
                      <br />🕐 Создана: {fmtDate(detail.createdAt)}
                    </div>

                    <button onClick={() => removeRequest(detail._id)} disabled={deleting === detail._id}
                      style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700, color: '#c0392b',
                        background: '#fdecea', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
                      🗑 Снять заявку
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Галерея */}
      {gallery && createPortal(
        <div onClick={() => setGallery(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <img src={gallery.photos[gallery.i]} alt=""
            onClick={e => { e.stopPropagation(); if (gallery.photos.length > 1) setGallery(g => ({ ...g, i: (g.i + 1) % g.photos.length })); }}
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, cursor: gallery.photos.length > 1 ? 'pointer' : 'default' }} />
          {gallery.photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 13 }}>
              {gallery.i + 1} / {gallery.photos.length} · нажмите на фото → следующее
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
