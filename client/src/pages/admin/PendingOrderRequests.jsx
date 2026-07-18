import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  adminGetProductRequests,
  adminGetMyProductRequests,
  adminCreateProductRequest,
  adminUpdateProductRequest,
  adminDeleteProductRequest,
  adminGetProducts,
} from '../../api';
import { useAuth } from '../../context/AuthContext';

const CLOUD = 'dnbg21ef8';
const PRESET = 'Matkasym';
const NO_PHOTO = '/logos/no-photo.png';

const TYPE_META = {
  new:     { label: 'Новый',      icon: '🆕', color: '#1d4ed8', bg: '#eff6ff' },
  catalog: { label: 'С каталога', icon: '🛒', color: '#b45309', bg: '#fef3c7' },
  test:    { label: 'Тест',       icon: '🧪', color: '#00838f', bg: '#e0f7fa' },
  real:    { label: 'Заказ',      icon: '🛒', color: '#b45309', bg: '#fef3c7' },
};

// Этапы доски закупки (в поле status). Порядок = движение слева направо.
const COLUMNS = [
  { key: 'new',             label: 'Новые заявки',     dot: '#DC1E24', bg: '#fef2f2', line: '#fecaca' },
  { key: 'searching',       label: 'Товар в поиске',   dot: '#f59e0b', bg: '#fffbeb', line: '#fde68a' },
  { key: 'supplier_select', label: 'Выбор поставщика', dot: '#7c3aed', bg: '#faf5ff', line: '#e9d5ff' },
  { key: 'done',            label: 'Завершён',         dot: '#22c55e', bg: '#f0fdf4', line: '#bbf7d0' },
];
const COL = Object.fromEntries(COLUMNS.map(c => [c.key, c]));
const stageIndex = k => COLUMNS.findIndex(c => c.key === k);
// На каких этапах закупщик ведёт поставщиков
const SUPPLIER_STAGES = new Set(['searching', 'supplier_select']);

const money = n => (Number(n) || 0).toLocaleString('ru-RU');
const fmtDay = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
// YYYY-MM-DD для <input type="date"> без UTC-сдвига
const ymd = d => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
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
  const { user } = useAuth();
  // Этапы и поставщиков ведёт закупщик (и владелец); содержимое заявки — автор или редактор
  const isPurchaser = user?.role === 'owner' || user?.role === 'purchaser' || user?.canOrderProducts;
  const canEditContent = (r) =>
    ['owner', 'editor'].includes(user?.role) ||
    String(r?.createdBy?._id || r?.createdBy) === String(user?._id);
  const [edit, setEdit]     = useState(null);   // заявка в режиме правки
  const [savingEdit, setSavingEdit] = useState(false);
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
    // Владелец / закупщик видят все заявки (обе колонки доски); остальные — свои
    adminGetProductRequests({})
      .then(r => {
        const list = r.data.requests || [];
        setItems(list);
        onCountChange?.(r.data.activeCount ?? list.filter(x => x.status !== 'done').length);
      })
      .catch(() =>
        adminGetMyProductRequests()
          .then(r => {
            const list = r.data.requests || [];
            setItems(list);
            onCountChange?.(list.filter(x => x.status !== 'done').length);
          })
          .catch(() => { setItems([]); onCountChange?.(0); })
      )
      .finally(() => setLoad(false));
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  // Правка содержимого заявки (только контент — этап и поставщики отдельно)
  const openEdit = (r) => {
    setEdit({
      _id:      r._id,
      number:   r.number,
      name:     r.name || '',
      quantity: r.quantity ?? '',
      sku:      r.sku || '',
      dimensions: r.dimensions || '',
      color:    r.color || '',
      note:     r.note || '',
      photos:   r.photos?.length ? [...r.photos] : (r.photo ? [r.photo] : []),
    });
  };

  const saveEdit = async () => {
    if (!edit.name.trim()) { alert('Название не может быть пустым'); return; }
    setSavingEdit(true);
    try {
      await adminUpdateProductRequest(edit._id, {
        name: edit.name, sku: edit.sku, dimensions: edit.dimensions,
        color: edit.color, note: edit.note, photos: edit.photos,
        quantity: edit.quantity === '' ? null : Number(edit.quantity),
      });
      setEdit(null);
      setDetail(null);
      load();
    } catch (e) {
      alert(e?.response?.data?.error || 'Не удалось сохранить заявку');
    } finally { setSavingEdit(false); }
  };

  // Перенос по этапам доски (закупщик)
  const moveTo = async (r, status, extra = {}) => {
    try {
      const updated = await adminUpdateProductRequest(r._id, { status, ...extra });
      setDetail(d => (d && d._id === r._id) ? updated.data : d);
      load();
    } catch (e) {
      alert(e?.response?.data?.error || 'Не удалось перенести заявку');
    }
  };

  // Сохранить список поставщиков (закупщик)
  const saveSuppliers = async (r, suppliers) => {
    try {
      const updated = await adminUpdateProductRequest(r._id, { suppliers });
      setDetail(d => (d && d._id === r._id) ? updated.data : d);
      load();
    } catch (e) {
      alert(e?.response?.data?.error || 'Не удалось сохранить поставщиков');
    }
  };

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

      {/* Доска этапов закупки: Новые → Поиск → Выбор поставщика → Завершён */}
      {loading ? (
        <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>Загрузка…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, background: '#f9f9f9', borderRadius: 16, color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📥</div>
          <div style={{ fontSize: 15 }}>Нет заявок на заказ</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 14, alignItems: 'start' }}>
        {COLUMNS.map(col => {
          const colItems = items.filter(r => (r.status || 'new') === col.key);
          const idx = stageIndex(col.key);
          return (
          <div key={col.key} style={{ background: col.bg, border: `1px solid ${col.line}`, borderRadius: 14, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 2px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot }} />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: .3 }}>{col.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: col.dot, borderRadius: 20, padding: '1px 8px' }}>{colItems.length}</span>
            </div>
            {colItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '22px 10px', color: '#b0b8c1', fontSize: 12.5 }}>Пусто</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {colItems.map(r => {
            const t = TYPE_META[r.type] || TYPE_META.real;
            const pics = r.photos?.length ? r.photos : (r.photo ? [r.photo] : []);
            const isDone = r.status === 'done';
            const suppliers = r.suppliers || [];
            const chosen = suppliers.find(s => s.chosen);
            const prevStage = idx > 0 ? COLUMNS[idx - 1] : null;
            const nextStage = idx < COLUMNS.length - 1 ? COLUMNS[idx + 1] : null;
            return (
              <div key={r._id} className="por-card" onClick={() => setDetail(r)}
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, background: '#fff',
                  border: `1.5px solid ${col.line}`, borderRadius: 12, padding: 14, cursor: 'pointer',
                  transition: 'box-shadow .15s, border-color .15s' }}
                onMouseOver={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor = col.dot; }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = col.line; }}>

                {/* Правка (только у кого есть право на контент) и снятие */}
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, zIndex: 1 }}>
                  {canEditContent(r) && (
                    <button onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                      title="Редактировать заявку"
                      style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: '#eef2ff',
                        color: '#3b5bdb', fontSize: 12, lineHeight: 1, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏️</button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); removeRequest(r._id); }} disabled={deleting === r._id}
                    title="Снять заявку"
                    style={{ width: 26, height: 26, borderRadius: 8,
                      border: 'none', background: '#fdecea', color: '#c0392b', fontSize: 14, lineHeight: 1,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {deleting === r._id ? '…' : '✕'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="por-photo"
                    style={{ position: 'relative', width: 72, height: 72, flexShrink: 0, borderRadius: 10, overflow: 'hidden',
                      background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {pics[0] ? <img src={pics[0]} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                             : <span style={{ fontSize: 26 }}>{t.icon}</span>}
                    {pics.length > 1 && (
                      <span style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,.65)',
                        color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 12 }}>+{pics.length - 1}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: t.color, background: t.bg, padding: '2px 7px', borderRadius: 20 }}>{t.icon} {t.label}</span>
                      <span style={{ fontSize: 10.5, color: '#b0b8c1' }}>№{r.number}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111', margin: '5px 0 3px' }}>{r.name}</div>
                    <div style={{ fontSize: 12.5, color: '#5b6572' }}>
                      {r.quantity ? <span style={{ marginRight: 10, fontWeight: 700, color: '#b45309' }}>📦 {r.quantity} шт</span> : null}
                      {r.color && <span>🎨 {r.color}</span>}
                    </div>
                  </div>
                </div>

                {/* Поставщики (этапы Поиск / Выбор) */}
                {suppliers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', background: '#faf5ff',
                      border: '1px solid #e9d5ff', borderRadius: 8, padding: '2px 8px' }}>🏭 {suppliers.length} поставщ.</span>
                    {chosen && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#15803d', background: '#f0fdf4',
                        border: '1px solid #bbf7d0', borderRadius: 8, padding: '2px 8px' }}>
                        ✓ {chosen.name || 'выбран'}{chosen.price ? ` · ${money(chosen.price)} ${chosen.currency}` : ''}
                      </span>
                    )}
                  </div>
                )}

                {/* Итог завершённой заявки */}
                {isDone && (r.purchasePrice || r.deliveryDate) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {r.purchasePrice > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#15803d', background: '#f0fdf4',
                        border: '1px solid #bbf7d0', borderRadius: 8, padding: '3px 9px' }}>
                        💵 {money(r.purchasePrice)} сом/шт{r.quantity ? ` · ${money(r.purchasePrice * r.quantity)}` : ''}
                      </span>
                    )}
                    {r.deliveryDate && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff',
                        border: '1px solid #bfdbfe', borderRadius: 8, padding: '3px 9px' }}>🚚 к {fmtDay(r.deliveryDate)}</span>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 11, color: '#9aa5b1', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    👤 {r.createdBy?.name || r.createdByName || 'фронтмен'}
                    {isDone && r.doneByName && <> · ✅ {r.doneByName}</>}
                  </div>
                  {/* Перенос по этапам — закупщик */}
                  {isPurchaser && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {prevStage && (
                        <button onClick={(e) => { e.stopPropagation(); moveTo(r, prevStage.key); }}
                          title={`← ${prevStage.label}`}
                          style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${col.line}`, background: '#fff',
                            color: '#64748b', fontSize: 13, cursor: 'pointer' }}>◀</button>
                      )}
                      {nextStage && (
                        <button onClick={(e) => { e.stopPropagation(); moveTo(r, nextStage.key); }}
                          title={`${nextStage.label} →`}
                          style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: nextStage.dot,
                            color: '#fff', fontSize: 13, cursor: 'pointer' }}>▶</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
            </div>
          </div>
          );
        })}
        </div>
      )}

      {/* Правка заявки: содержимое — всем, кто видит доску; цена и срок — только закупщику */}
      {edit && createPortal(
        <>
          <div onClick={() => !savingEdit && setEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1700 }} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 1701, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
            <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '92vh',
              overflow: 'auto', padding: 22, pointerEvents: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>Заявка №{edit.number}</div>
                <span style={{ flex: 1 }} />
                <button onClick={() => setEdit(null)} disabled={savingEdit}
                  style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 16, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Фото */}
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#444', marginBottom: 6 }}>Фото</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {edit.photos.map((p, i) => (
                  <div key={i} style={{ position: 'relative', width: 74, height: 74, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => setEdit(s => ({ ...s, photos: s.photos.filter((_, j) => j !== i) }))}
                      title="Убрать фото"
                      style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 6, border: 'none',
                        background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                  </div>
                ))}
                <label style={{ width: 74, height: 74, borderRadius: 10, border: '1.5px dashed #cbd5e1', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: 22 }}>
                  ＋
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                    onChange={async e => {
                      const files = [...(e.target.files || [])];
                      e.target.value = '';
                      for (const f of files) {
                        const fd = new FormData();
                        fd.append('file', f); fd.append('upload_preset', PRESET);
                        try {
                          const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: 'POST', body: fd });
                          const j = await res.json();
                          if (j.secure_url) setEdit(s => ({ ...s, photos: [...s.photos, j.secure_url] }));
                        } catch (_) { alert('Не удалось загрузить фото'); }
                      }
                    }} />
                </label>
              </div>

              {[
                ['Название', 'name', 'text'],
                ['Количество, шт', 'quantity', 'number'],
                ['Артикул', 'sku', 'text'],
                ['Размеры', 'dimensions', 'text'],
                ['Цвет', 'color', 'text'],
                ['Комментарий', 'note', 'text'],
              ].map(([label, key, type]) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#444', marginBottom: 4 }}>{label}</div>
                  <input type={type} value={edit[key]} min={type === 'number' ? 1 : undefined}
                    onChange={e => setEdit(s => ({ ...s, [key]: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9,
                      border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none' }} />
                </div>
              ))}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => setEdit(null)} disabled={savingEdit}
                  style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', color: '#555', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Отмена</button>
                <button onClick={saveEdit} disabled={savingEdit}
                  style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#111', color: '#fff', fontSize: 14, fontWeight: 700, cursor: savingEdit ? 'wait' : 'pointer', opacity: savingEdit ? .6 : 1 }}>
                  {savingEdit ? 'Сохраняю…' : 'Сохранить'}</button>
              </div>
            </div>
          </div>
        </>, document.body)}

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

                    {/* Текущий этап + перенос (закупщик) */}
                    <div style={{ background: (COL[detail.status] || COL.new).bg, border: `1px solid ${(COL[detail.status] || COL.new).line}`,
                      borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isPurchaser ? 10 : 0 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: (COL[detail.status] || COL.new).dot }} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>Этап: {(COL[detail.status] || COL.new).label}</span>
                        {detail.status === 'done' && detail.doneByName && (
                          <span style={{ fontSize: 12, color: '#15803d' }}>· ✅ {detail.doneByName}</span>
                        )}
                      </div>
                      {isPurchaser && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {stageIndex(detail.status) > 0 && (
                            <button onClick={() => moveTo(detail, COLUMNS[stageIndex(detail.status) - 1].key)}
                              style={{ flex: '1 1 130px', padding: '10px', fontSize: 13.5, fontWeight: 700, color: '#64748b',
                                background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, cursor: 'pointer' }}>
                              ◀ {COLUMNS[stageIndex(detail.status) - 1].label}
                            </button>
                          )}
                          {stageIndex(detail.status) < COLUMNS.length - 1 && (
                            <button onClick={() => moveTo(detail, COLUMNS[stageIndex(detail.status) + 1].key)}
                              style={{ flex: '1 1 130px', padding: '10px', fontSize: 13.5, fontWeight: 700, color: '#fff',
                                background: COLUMNS[stageIndex(detail.status) + 1].dot, border: 'none', borderRadius: 10, cursor: 'pointer' }}>
                              {COLUMNS[stageIndex(detail.status) + 1].label} ▶
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Поставщики — этапы Поиск / Выбор, и просмотр на Завершён */}
                    {(SUPPLIER_STAGES.has(detail.status) || (detail.suppliers || []).length > 0) && (
                      <SuppliersEditor
                        request={detail}
                        canEdit={isPurchaser}
                        canChoose={detail.status === 'supplier_select' || detail.status === 'done'}
                        onSave={(list) => saveSuppliers(detail, list)}
                      />
                    )}

                    <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      {canEditContent(detail) && (
                        <button onClick={() => { openEdit(detail); }}
                          style={{ flex: 1, minWidth: 130, padding: '13px', fontSize: 14.5, fontWeight: 700, color: '#3b5bdb',
                            background: '#eef2ff', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
                          ✏️ Редактировать заявку
                        </button>
                      )}
                      <button onClick={() => removeRequest(detail._id)} disabled={deleting === detail._id}
                        style={{ flex: 1, minWidth: 130, padding: '13px', fontSize: 14.5, fontWeight: 700, color: '#c0392b',
                          background: '#fdecea', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
                        🗑 Снять заявку
                      </button>
                    </div>
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

// Поставщики заявки: закупщик добавляет найденных, заносит цену/условия и выбирает нужного.
const CURRENCIES = ['сом', '₸', '$'];
const emptySupplier = () => ({ name: '', price: '', currency: 'сом', terms: '', note: '', chosen: false });

function SuppliersEditor({ request, canEdit, canChoose, onSave }) {
  const [list, setList] = useState(() =>
    (request.suppliers || []).map(s => ({ ...s, price: s.price ?? '' })));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Синхронизируем при внешнем обновлении (перенос этапа/сохранение)
  useEffect(() => {
    setList((request.suppliers || []).map(s => ({ ...s, price: s.price ?? '' })));
    setDirty(false);
  }, [request._id, JSON.stringify(request.suppliers)]);

  const patch = (i, key, val) => { setList(l => l.map((s, j) => j === i ? { ...s, [key]: val } : s)); setDirty(true); };
  const choose = (i) => { setList(l => l.map((s, j) => ({ ...s, chosen: j === i ? !s.chosen : false }))); setDirty(true); };
  const add = () => { setList(l => [...l, emptySupplier()]); setDirty(true); };
  const remove = (i) => { setList(l => l.filter((_, j) => j !== i)); setDirty(true); };

  const save = async () => {
    setSaving(true);
    await onSave(list.map(s => ({ ...s, price: s.price === '' ? null : Number(s.price) })));
    setSaving(false); setDirty(false);
  };

  const inp = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none' };

  return (
    <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: .4 }}>🏭 Поставщики</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#a78bfa', borderRadius: 20, padding: '1px 8px' }}>{list.length}</span>
        {canChoose && <span style={{ fontSize: 11, color: '#9061c2' }}>· отметьте выбранного ★</span>}
      </div>

      {list.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#a78bfa', marginBottom: 10 }}>
          {canEdit ? 'Пока никого. Найдите товар у поставщиков и добавьте их для сравнения.' : 'Закупщик ещё не добавил поставщиков.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((s, i) => (
          <div key={i} style={{ background: '#fff', border: `1.5px solid ${s.chosen ? '#22c55e' : '#ede9fe'}`, borderRadius: 10, padding: 10 }}>
            {!canEdit ? (
              // Только просмотр
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111' }}>
                  {s.chosen && <span style={{ color: '#15803d' }}>★ </span>}{s.name || '(без названия)'}
                </div>
                <div style={{ fontSize: 12.5, color: '#5b6572', marginTop: 3 }}>
                  {s.price ? <b style={{ color: '#111' }}>{money(s.price)} {s.currency}/шт</b> : '—'}
                  {s.terms && <> · {s.terms}</>}
                </div>
                {s.note && <div style={{ fontSize: 12, color: '#8a94a0', marginTop: 3 }}>💬 {s.note}</div>}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input placeholder="Название / контакт / ссылка" value={s.name} onChange={e => patch(i, 'name', e.target.value)} style={{ ...inp, flex: 1 }} />
                  {canChoose && (
                    <button onClick={() => choose(i)} title="Выбрать этого поставщика"
                      style={{ flexShrink: 0, width: 38, borderRadius: 8, border: `1.5px solid ${s.chosen ? '#22c55e' : '#e5e7eb'}`,
                        background: s.chosen ? '#22c55e' : '#fff', color: s.chosen ? '#fff' : '#cbd5e1', fontSize: 15, cursor: 'pointer' }}>★</button>
                  )}
                  <button onClick={() => remove(i)} title="Убрать"
                    style={{ flexShrink: 0, width: 32, borderRadius: 8, border: 'none', background: '#fdecea', color: '#c0392b', fontSize: 14, cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input type="number" min="0" placeholder="Цена/шт" value={s.price} onChange={e => patch(i, 'price', e.target.value)} style={{ ...inp, flex: 1 }} />
                  <select value={s.currency} onChange={e => patch(i, 'currency', e.target.value)} style={{ ...inp, width: 72, flexShrink: 0, cursor: 'pointer' }}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <input placeholder="Срок / мин. заказ / условия" value={s.terms} onChange={e => patch(i, 'terms', e.target.value)} style={{ ...inp, marginBottom: 6 }} />
                <input placeholder="Заметка" value={s.note} onChange={e => patch(i, 'note', e.target.value)} style={inp} />
              </>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={add}
            style={{ flex: 1, padding: '9px', borderRadius: 9, border: '1.5px dashed #c4b5fd', background: '#fff', color: '#7c3aed', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ＋ Поставщик
          </button>
          {dirty && (
            <button onClick={save} disabled={saving}
              style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? .6 : 1 }}>
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
