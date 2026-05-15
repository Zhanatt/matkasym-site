import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  adminGetProduct, adminCreateProduct, adminUpdateProduct,
  adminGetBrands, adminUpdateBrand,
  adminGetCategorySpecs, adminSaveCategorySpec,
  adminGetCustomCategories, adminCreateCustomCategory,
  adminGetFacets,
} from '../../api/index';
import ImageUploader  from '../../components/ImageUploader';
import SelectWithAdd  from '../../components/SelectWithAdd';
import { CATEGORIES, CATEGORY_SPECS } from '../../config/categorySpecs';

// Spec keys that duplicate top-level fields (dimensions, color) — skip in specs grid
const SKIP_SPEC_KEYS = new Set(['Цвет']);
const isDimensionKey = k => /^габарит/i.test(k.trim());

export const CRM_STAGES = [
  'Новая заявка',
  'Разработка Тех. листа',
  'Утверждение Тех. листа',
  'Моделирование',
  'Чертеж',
  'Образец',
  'Утверждение образца',
  'Передали на производство',
];

const BRAND_OPTIONS = [
  { value: 'matkasym-home',   label: 'MATKASYM HOME' },
  { value: 'matkasym-shaar',  label: 'MATKASYM SHAAR' },
  { value: 'matkasym-kyzmat', label: 'MATKASYM KYZMAT' },
];

// Master list of all sets — synced with AdminSets SET_NAMES
const STATIC_SET_NAMES = {
  // HOME
  'achyk-asman':     'Achyk Asman',
  'baary-oorunda':   'Baary Oorunda',
  'den-sooluk':      'DEN SOOLUK — Здоровье',
  'jenil-ashkana':   'Jenil Ashkana',
  'konok-keldi':     'Konok Keldi',
  'korkom-aiym':     'Korkom Aiym',
  'kosh-keliniz':    'KOSH KELINIZ — Кош келиниз',
  'sanarip-tv':      'Sanarip TV',
  'shirin-balalyk':  'Shirin Balalyk',
  'taza-kiym':       'TAZA KIYM — Чистая одежда',
  'uydo-ishtoo':     'Uydo Ishtoo',
  'zhashyl-ömür':    'Zhashyl ÖMüR',
  // SHAAR
  'bekem-fasad':     'Bekem Fasad',
  'bilim-kelechek':  'Bilim Kelechek',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'mazza-seiyl':     'Mazza Seiyl',
  'onoi-sakta':      'Onoi Sakta',
  'uzak-koldon':     'Uzak Koldon',
  // KYZMAT
  '0-tashtandy':     '0-Tashtandy',
  'dayar-tütük':     'Dayar Tütük',
  'önügüü-set':      'Önügüü Set',
  // Прочие
  'nelikvid':        'Неликвид',
  'samples':         'Образцы',
  'small-batch':     'Малосерийные',
  'misc':            'Разное',
  'equipment':       'Оборудование и сырьё',
  'other':           'Прочее',
};

const COLOR_OPTIONS = [
  { value: 'white',  label: 'Белый',      hex: '#ffffff', border: '#ddd' },
  { value: 'black',  label: 'Чёрный',     hex: '#1c1c1c' },
  { value: 'grey',   label: 'Серый',      hex: '#9e9e9e' },
  { value: 'brown',  label: 'Коричневый', hex: '#795548' },
  { value: 'beige',  label: 'Бежевый',    hex: '#d7c4a3' },
  { value: 'red',    label: 'Красный',    hex: '#e53935' },
  { value: 'blue',   label: 'Синий',      hex: '#1565c0' },
  { value: 'green',  label: 'Зелёный',    hex: '#2e7d32' },
  { value: 'gold',   label: 'Золотой',    hex: '#f9a825' },
  { value: 'silver', label: 'Серебряный', hex: '#b0bec5' },
];

const CLOUD_NAME    = 'dnbg21ef8';
const UPLOAD_PRESET = 'Matkasym';

const EMPTY = {
  name: '', fullName: '', sku: '',
  brand: 'matkasym-home', set: '', setLevel: '', color: '',
  category: '',
  dimensions: '',
  specs: [],
  priceCost: '', priceWholesale: '', priceDealer: '', price: '', priceNavigation: '',
  description: '',
  images: [],
  inStock: true, isNew: false, stock: 50, stockStatus: 'in_stock', productStatus: 'for_sale', developmentStage: '',
  developmentTZ: { description: '', files: [] },
  improvementTZ: { problem: '', solution: '', files: [] },
};

// ── TZBlock ───────────────────────────────────────────────────────────────────

function TZBlock({ label, accent, fields, data, onChange }) {
  const [uploading, setUploading] = useState(false);

  const setField = (key, value) => onChange({ ...data, [key]: value });

  const removeFile = (idx) => {
    onChange({ ...data, files: data.files.filter((_, i) => i !== idx) });
  };

  const handleFileInput = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', UPLOAD_PRESET);
      fd.append('folder', 'matkasym-tz');
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: 'POST', body: fd });
      const json = await r.json();
      if (json.secure_url) {
        onChange({ ...data, files: [...(data.files || []), { name: file.name, url: json.secure_url }] });
      }
    } catch (err) {
      console.error('TZ file upload error:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div style={{ marginTop: 16, padding: '16px 20px', borderRadius: 10, border: `1.5px solid ${accent}30`, background: `${accent}08` }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: accent, marginBottom: 14 }}>
        {label}
      </div>
      {fields.map(f => (
        <div key={f.key} className="admin-form-group" style={{ marginBottom: 12 }}>
          <label style={{ color: accent }}>{f.label}</label>
          <textarea
            value={data[f.key] || ''}
            onChange={e => setField(f.key, e.target.value)}
            placeholder={f.placeholder}
            rows={4}
            style={{ borderColor: `${accent}40`, resize: 'vertical' }}
          />
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Прикреплённые файлы
        </div>
        {(data.files || []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {data.files.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--gray-200)', fontSize: 13 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#333' }}>
                  📎 {f.name}
                </span>
                <a href={f.url} target="_blank" rel="noreferrer" style={{ color: accent, fontSize: 12, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                  Открыть
                </a>
                <button type="button" onClick={() => removeFile(i)}
                  style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 8, cursor: uploading ? 'wait' : 'pointer',
          border: `1.5px dashed ${accent}60`, background: '#fafafa',
          fontSize: 13, fontWeight: 600, color: accent, opacity: uploading ? 0.6 : 1,
        }}>
          <input type="file" style={{ display: 'none' }} onChange={handleFileInput} disabled={uploading} />
          {uploading ? '⏳ Загрузка...' : '+ Прикрепить файл'}
        </label>
      </div>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SH({ text }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: '#8899a6', marginBottom: 18 }}>
      {text}
    </div>
  );
}

// ── Card wrapper ───────────────────────────────────────────────────────────────

function Card({ children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', padding: '24px 28px' }}>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id || id === 'new';

  const dupData = isNew ? location.state?.duplicate : null;
  const [form, setForm]     = useState(dupData ? { ...EMPTY, ...dupData } : EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const [brandsData, setBrandsData]       = useState([]);
  const [facetSets, setFacetSets]         = useState([]);
  const [categories, setCategories]       = useState(CATEGORIES);
  const [savedCatSpecs, setSavedCatSpecs] = useState([]);
  const [savingSpec, setSavingSpec]       = useState(null);

  const loadSavedCatSpecs = useCallback((category) => {
    if (!category) return;
    adminGetCategorySpecs(category).then(r => setSavedCatSpecs(r.data)).catch(() => {});
  }, []);

  // Load brands
  useEffect(() => {
    adminGetBrands().then(r => setBrandsData(r.data)).catch(() => {});
  }, []);

  // Load facet sets when brand changes (sync with AdminSets page)
  useEffect(() => {
    if (!form.brand) return;
    adminGetFacets({ brand: form.brand })
      .then(r => setFacetSets(r.data.sets || []))
      .catch(() => {});
  }, [form.brand]);

  // Load custom categories
  useEffect(() => {
    adminGetCustomCategories()
      .then(r => {
        if (r.data.length > 0) {
          const staticKeys = new Set(CATEGORIES.map(c => c.value));
          const extra = r.data.filter(c => !staticKeys.has(c.value));
          if (extra.length > 0) setCategories(prev => [...prev, ...extra]);
        }
      })
      .catch(() => {});
  }, []);

  // Load product for edit
  useEffect(() => {
    if (isNew) return;
    if (!id || id === 'undefined' || id === 'null') { navigate(-1); return; }
    adminGetProduct(id)
      .then(r => {
        const p = r.data;
        const baseSpecs = p.specs || [];
        setForm({
          ...p,
          images:         p.images || [],
          specs:          baseSpecs,
          priceCost:        p.priceCost ?? '',
          priceWholesale:   p.priceWholesale ?? '',
          priceDealer:      p.priceDealer ?? '',
          priceNavigation:  p.priceNavigation ?? '',
          dimensions:       p.dimensions || '',
          developmentTZ:  p.developmentTZ || { description: '', files: [] },
          improvementTZ:  p.improvementTZ || { problem: '', solution: '', files: [] },
        });
        if (p.category) {
          adminGetCategorySpecs(p.category)
            .then(catR => {
              setSavedCatSpecs(catR.data || []);
              const existingKeys = new Set(baseSpecs.map(s => s.key));
              const missing = (catR.data || []).filter(s => !existingKeys.has(s.key) && !isDimensionKey(s.key));
              if (missing.length > 0) {
                setForm(f => ({
                  ...f,
                  specs: [...f.specs, ...missing.map(s => ({ key: s.key, value: '', options: s.options || [] }))],
                }));
              }
            })
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleCategoryChange = (value) => {
    const staticSpecs = (CATEGORY_SPECS[value] || []).filter(t => t.key !== 'Цвет' && !isDimensionKey(t.key));
    adminGetCategorySpecs(value)
      .then(r => {
        setSavedCatSpecs(r.data);
        const allKeys = new Set(staticSpecs.map(t => t.key));
        const extraSpecs = (r.data || [])
          .filter(s => !allKeys.has(s.key))
          .map(s => ({ key: s.key, value: '', options: s.options || [] }));
        setForm(f => ({
          ...f, category: value,
          specs: [...staticSpecs.map(t => ({ key: t.key, value: '' })), ...extraSpecs],
        }));
      })
      .catch(() => {
        setSavedCatSpecs([]);
        setForm(f => ({ ...f, category: value, specs: staticSpecs.map(t => ({ key: t.key, value: '' })) }));
      });
  };

  const setSpec = (idx, field, value) => {
    setForm(f => {
      const specs = [...f.specs];
      specs[idx] = { ...specs[idx], [field]: value };
      return { ...f, specs };
    });
  };

  const addCustomSpec = () => {
    setForm(f => ({ ...f, specs: [...f.specs, { key: '', value: '', options: [], unit: '' }] }));
  };

  const removeSpec = (idx) => {
    setForm(f => ({ ...f, specs: f.specs.filter((_, i) => i !== idx) }));
  };

  const saveSpecToCategory = async (idx) => {
    const spec = form.specs[idx];
    if (!spec.key.trim() || !form.category) return;
    setSavingSpec(idx);
    try {
      const type = spec.options?.length > 0 ? 'select' : 'text';
      const result = await adminSaveCategorySpec(form.category, {
        key: spec.key.trim(), type,
        unit: spec.unit || '',
        options: spec.options?.filter(Boolean) || [],
      });
      setSavedCatSpecs(result.data);
    } finally {
      setSavingSpec(null);
    }
  };

  // ── Set options: merge Brand.sets + facetSets + static master list ─────────
  const currentBrand = brandsData.find(b => b.key === form.brand);
  const brandSetMap  = Object.fromEntries((currentBrand?.sets || []).map(s => [s.key, s]));
  const mergedSlugs  = [...new Set([
    ...Object.keys(STATIC_SET_NAMES),
    ...(currentBrand?.sets || []).map(s => s.key),
    ...facetSets,
  ])];
  const setOptions = mergedSlugs
    .map(slug => {
      const s = brandSetMap[slug];
      const label = s
        ? `${s.label}${s.labelRu ? ` — ${s.labelRu}` : ''}`
        : (STATIC_SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
      return { value: slug, label };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const currentSet   = currentBrand?.sets?.find(s => s.key === form.set);
  const levelOptions = (currentSet?.levels || []).map(l => ({ value: l.toLowerCase(), label: l }));

  const handleAddSet = async ({ value, label }) => {
    if (!currentBrand) return;
    const newSet = { key: value, label: label.toUpperCase(), labelRu: '', levels: [], order: (currentBrand.sets?.length || 0) + 1 };
    const updatedSets = [...(currentBrand.sets || []), newSet];
    await adminUpdateBrand(currentBrand.key, { sets: updatedSets });
    setBrandsData(prev => prev.map(b => b.key === currentBrand.key ? { ...b, sets: updatedSets } : b));
  };

  const handleAddLevel = async ({ label }) => {
    if (!currentBrand || !currentSet) return;
    const updatedSets = currentBrand.sets.map(s =>
      s.key === currentSet.key ? { ...s, levels: [...s.levels, label] } : s
    );
    await adminUpdateBrand(currentBrand.key, { sets: updatedSets });
    setBrandsData(prev => prev.map(b => b.key === currentBrand.key ? { ...b, sets: updatedSets } : b));
  };

  const handleAddCategory = async ({ value, label }) => {
    setCategories(prev => [...prev, { value, label }]);
    try { await adminCreateCustomCategory({ value, label }); } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isNew && (!id || id === 'undefined' || id === 'null')) {
      setError('Неверный идентификатор товара — обновите страницу');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { _id, __v, id: _sid, ...rest } = form;
      const payload = {
        ...rest,
        priceCost:        Number(form.priceCost) || 0,
        priceWholesale:   Number(form.priceWholesale) || 0,
        priceDealer:      Number(form.priceDealer) || 0,
        price:            Number(form.price),
        priceNavigation:  form.brand === 'matkasym-home' ? (Number(form.priceNavigation) || 0) : 0,
        stock:          Number(form.stock) || 0,
        inStock:        form.stockStatus === 'in_stock',
      };
      if (isNew) await adminCreateProduct(payload);
      else       await adminUpdateProduct(id, payload);
      navigate(-1);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="admin-empty">Загрузка...</div>;

  const saveBtn = (
    <button type="submit" className="btn btn-primary" disabled={saving}>
      {saving ? 'Сохранение...' : isNew ? 'Создать товар' : 'Сохранить'}
    </button>
  );

  return (
    <form className="admin-form" onSubmit={handleSubmit}>

      {/* ── Top action bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Назад</button>
        <h1 style={{ flex: 1, margin: 0, fontSize: 20, fontWeight: 700, color: '#111' }}>
          {isNew ? 'Новый товар' : 'Редактировать товар'}
        </h1>
        {saveBtn}
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Отмена</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>

        {/* ── ОСНОВНОЕ ── */}
        <Card>
          <SH text="Основное" />
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Название *</label>
              <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="TAZA KIYM Standard" />
            </div>
            <div className="admin-form-group" style={{ flex: '0 0 160px' }}>
              <label>SKU</label>
              <input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="TK-STD-W" />
            </div>
          </div>
          <div className="admin-form-group">
            <label>Полное название *</label>
            <input required value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="MATKASYM HOME — TAZA KIYM Standard (белый)" />
          </div>
        </Card>

        {/* ── ПРИНАДЛЕЖНОСТЬ ── */}
        <Card>
          <SH text="Принадлежность" />
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Бренд *</label>
              <select value={form.brand} onChange={e => { set('brand', e.target.value); set('set', ''); set('setLevel', ''); }}>
                {BRAND_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div className="admin-form-group">
              <label>Категория *</label>
              <SelectWithAdd
                options={categories}
                value={form.category}
                onChange={handleCategoryChange}
                onAdd={(item) => { handleAddCategory(item); handleCategoryChange(item.value); }}
                placeholder="Выберите категорию..."
              />
            </div>
          </div>

          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Сет</label>
              <SelectWithAdd
                options={setOptions}
                value={form.set}
                onChange={v => { set('set', v); set('setLevel', ''); }}
                onAdd={handleAddSet}
                placeholder="Выберите сет..."
              />
            </div>
            {levelOptions.length > 0 && (
              <div className="admin-form-group">
                <label>Уровень сета</label>
                <SelectWithAdd
                  options={levelOptions}
                  value={form.setLevel}
                  onChange={v => set('setLevel', v)}
                  onAdd={handleAddLevel}
                  placeholder="Выберите уровень..."
                />
              </div>
            )}
          </div>

          {/* Color pills */}
          <div className="admin-form-group">
            <label>Цвет</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={() => set('color', '')}
                style={{
                  height: 30, padding: '0 12px', borderRadius: 15, fontSize: 12, cursor: 'pointer',
                  border: `2px solid ${!form.color ? '#333' : '#e0e0e0'}`,
                  background: !form.color ? '#333' : '#fff',
                  color: !form.color ? '#fff' : '#aaa',
                  fontWeight: 600,
                }}>
                Нет
              </button>
              {COLOR_OPTIONS.map(c => (
                <button key={c.value} type="button" onClick={() => set('color', form.color === c.value ? '' : c.value)}
                  title={c.label}
                  style={{
                    width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                    background: c.hex,
                    border: `3px solid ${form.color === c.value ? '#111' : (c.border || 'transparent')}`,
                    outline: form.color === c.value ? '2px solid #555' : 'none',
                    outlineOffset: 2,
                    boxShadow: '0 1px 4px rgba(0,0,0,.18)',
                    padding: 0,
                  }}
                />
              ))}
              {form.color && (
                <span style={{ fontSize: 12, color: '#888', marginLeft: 4 }}>
                  {COLOR_OPTIONS.find(c => c.value === form.color)?.label}
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* ── ФОТОГРАФИИ ── */}
        <Card>
          <SH text="Фотографии" />
          <ImageUploader images={form.images} onChange={urls => set('images', urls)} />
        </Card>

        {/* ── ХАРАКТЕРИСТИКИ ── */}
        <Card>
          <SH text="Характеристики" />
          <div className="admin-form-group" style={{ marginBottom: 16 }}>
            <label>Габариты (ДxШxВ)</label>
            <input value={form.dimensions} onChange={e => set('dimensions', e.target.value)} placeholder="134x55x108 см" />
          </div>
          <div className="admin-specs-grid">
            {form.specs.map((spec, idx) => {
              if (SKIP_SPEC_KEYS.has(spec.key) || isDimensionKey(spec.key)) return null;
              // Hide duplicate keys — only show first occurrence
              const firstIdx = form.specs.findIndex(s => s.key === spec.key);
              if (firstIdx !== idx) return null;
              const template = (CATEGORY_SPECS[form.category] || []).find(t => t.key === spec.key);
              const isCustom = !template;
              const isSelect = template?.type === 'select' || (isCustom && spec.options?.length > 0);

              return (
                <div className="admin-form-group" key={idx} style={{ position: 'relative' }}>
                  {isCustom ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <input
                        value={spec.key}
                        onChange={e => setSpec(idx, 'key', e.target.value)}
                        placeholder="НАЗВАНИЕ"
                        style={{
                          flex: 1, fontSize: 11, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: 0.5,
                          color: 'var(--slate)', border: 'none',
                          borderBottom: '1.5px solid var(--gray-200)',
                          padding: '2px 0', background: 'transparent', outline: 'none',
                        }}
                      />
                      <select
                        value={spec.unit || ''}
                        onChange={e => setSpec(idx, 'unit', e.target.value)}
                        style={{
                          fontSize: 11, border: '1px solid var(--gray-200)', borderRadius: 4,
                          padding: '1px 4px', color: 'var(--slate)', background: '#f7f8fa',
                          cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        <option value="">—</option>
                        <option value="см">см</option>
                        <option value="мм">мм</option>
                        <option value="кг">кг</option>
                        <option value="г">г</option>
                        <option value="м">м</option>
                        <option value="л">л</option>
                        <option value="мл">мл</option>
                        <option value="шт">шт</option>
                      </select>
                      {spec.key.trim() && form.category && !savedCatSpecs.some(s => s.key === spec.key.trim()) && (
                        <button type="button" onClick={() => saveSpecToCategory(idx)} disabled={savingSpec === idx}
                          style={{
                            fontSize: 11, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                            border: '1px solid #2d7a3a',
                            background: savingSpec === idx ? '#e6f4ea' : '#2d7a3a',
                            color: savingSpec === idx ? '#2d7a3a' : '#fff',
                            fontWeight: 700, flexShrink: 0,
                          }}
                          title="Сохранить в шаблон категории">
                          {savingSpec === idx ? '…' : '✓'}
                        </button>
                      )}
                      {spec.key.trim() && savedCatSpecs.some(s => s.key === spec.key.trim()) && (
                        <span style={{ fontSize: 12, color: '#2d7a3a', fontWeight: 700, flexShrink: 0 }}>✓</span>
                      )}
                      <button type="button" onClick={() => removeSpec(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                        title="Удалить">×</button>
                    </div>
                  ) : (
                    <label>
                      {spec.key}
                      {(template?.unit || spec.unit) && (
                        <span style={{ color: 'var(--slate)', fontWeight: 400, marginLeft: 4 }}>
                          ({template?.unit || spec.unit})
                        </span>
                      )}
                    </label>
                  )}

                  {isCustom && isSelect && (
                    <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {spec.options.map((opt, oi) => (
                        <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <input
                            value={opt}
                            onChange={e => {
                              const opts = [...spec.options];
                              opts[oi] = e.target.value;
                              setSpec(idx, 'options', opts);
                            }}
                            placeholder={`Вариант ${oi + 1}`}
                            style={{ width: 90, fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--gray-300)' }}
                          />
                          <button type="button"
                            onClick={() => setSpec(idx, 'options', spec.options.filter((_, i) => i !== oi))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 14, padding: '0 2px' }}>
                            ×
                          </button>
                        </div>
                      ))}
                      <button type="button"
                        onClick={() => setSpec(idx, 'options', [...spec.options, ''])}
                        style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px dashed var(--gray-300)', background: '#fafafa', cursor: 'pointer', color: 'var(--slate)' }}>
                        + вариант
                      </button>
                    </div>
                  )}

                  {isSelect ? (
                    <select value={spec.value} onChange={e => setSpec(idx, 'value', e.target.value)}>
                      <option value="">— выберите —</option>
                      {(template?.options || spec.options || []).filter(Boolean).map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={template?.type === 'number' ? 'number' : 'text'}
                      value={spec.value}
                      onChange={e => setSpec(idx, 'value', e.target.value)}
                      placeholder={template?.unit || ''}
                      min={template?.type === 'number' ? 0 : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addCustomSpec}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, padding: '8px 16px', borderRadius: 8,
              border: '1.5px dashed var(--gray-300)', background: '#fafafa',
              cursor: 'pointer', color: 'var(--slate)', fontWeight: 600, marginTop: 4,
            }}>
            + Добавить свойство
          </button>
        </Card>

        {/* ── ЦЕНЫ ── */}
        <Card>
          <SH text="Цены (сом)" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            <div className="admin-form-group">
              <label>Себестоимость</label>
              <input type="number" min="0" value={form.priceCost} onChange={e => set('priceCost', e.target.value)} placeholder="0" />
            </div>
            <div className="admin-form-group">
              <label>Оптовая</label>
              <input type="number" min="0" value={form.priceWholesale} onChange={e => set('priceWholesale', e.target.value)} placeholder="0" />
            </div>
            <div className="admin-form-group">
              <label>Дилерская</label>
              <input type="number" min="0" value={form.priceDealer} onChange={e => set('priceDealer', e.target.value)} placeholder="0" />
            </div>
            <div className="admin-form-group">
              <label>Розничная *</label>
              <input required type="number" min="0" value={form.price} onChange={e => {
                set('price', e.target.value);
                if (form.brand === 'matkasym-home') {
                  const nav = Math.round(Number(e.target.value) * 1.2);
                  set('priceNavigation', nav > 0 ? nav : '');
                }
              }} placeholder="0" />
            </div>
            {form.brand === 'matkasym-home' && (
              <div className="admin-form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Навигационная
                  <span style={{ fontSize: 10, color: '#aaa', fontWeight: 400 }}>+20% от розничной</span>
                </label>
                <input type="number" min="0" value={form.priceNavigation} onChange={e => set('priceNavigation', e.target.value)} placeholder={form.price ? Math.round(Number(form.price) * 1.2) : '0'} />
              </div>
            )}
          </div>
        </Card>

        {/* ── СТАТУС ── */}
        <Card>
          <SH text="Статус" />

          {/* Product status */}
          <div className="admin-form-group" style={{ marginBottom: 20 }}>
            <label>Статус товара</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {[
                { value: 'for_sale',       label: '🛒 В продаже',     bg: '#e6f4ea', color: '#2d7a3a', border: '#a8d5b0' },
                { value: 'planned',        label: '📋 В плане',       bg: '#eef2ff', color: '#3b5bdb', border: '#bfcbfb' },
                { value: 'in_development', label: '🔨 В разработке',  bg: '#f3e8ff', color: '#7c3aed', border: '#c4b5fd' },
                { value: 'improvement',    label: '🔧 На улучшении',  bg: '#fff8e6', color: '#c47a00', border: '#f0c060' },
                { value: 'discontinued',   label: '🚫 Снят',          bg: '#f5f5f5', color: '#888',    border: '#ccc'    },
                { value: 'liquidation',    label: '🔴 Ликвидация',    bg: '#fff0f0', color: '#c0392b', border: '#e74c3c' },
              ].map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `2px solid ${form.productStatus === opt.value ? opt.border : 'var(--gray-200)'}`,
                  background: form.productStatus === opt.value ? opt.bg : '#fff',
                  color: form.productStatus === opt.value ? opt.color : 'var(--slate)',
                  fontWeight: form.productStatus === opt.value ? 700 : 500,
                  fontSize: 13, transition: 'all .15s',
                }}>
                  <input type="radio" name="productStatus" value={opt.value}
                    checked={form.productStatus === opt.value}
                    onChange={() => set('productStatus', opt.value)}
                    style={{ display: 'none' }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* CRM stages */}
          {form.productStatus === 'in_development' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                Этап разработки
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CRM_STAGES.map((stage, i) => {
                  const active = form.developmentStage === stage;
                  return (
                    <button key={stage} type="button" onClick={() => set('developmentStage', active ? '' : stage)}
                      style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        border: active ? '2px solid #7c3aed' : '1.5px solid var(--gray-200)',
                        background: active ? '#f3e8ff' : '#fff',
                        color: active ? '#7c3aed' : '#555',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                      <span style={{ fontSize: 11, background: active ? '#7c3aed' : '#ddd', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      {stage}
                    </button>
                  );
                })}
              </div>
              <TZBlock
                label="Техническое задание"
                accent="#7c3aed"
                fields={[{ key: 'description', label: 'Описание ТЗ', placeholder: 'Опишите техническое задание, требования, детали разработки...' }]}
                data={form.developmentTZ}
                onChange={val => set('developmentTZ', val)}
              />
            </div>
          )}

          {form.productStatus === 'improvement' && (
            <TZBlock
              label="Задача на улучшение"
              accent="#c47a00"
              fields={[
                { key: 'problem',  label: 'В чем проблема?',   placeholder: 'Опишите текущую проблему продукта...' },
                { key: 'solution', label: 'Возможное решение', placeholder: 'Опишите возможные пути решения...' },
              ]}
              data={form.improvementTZ}
              onChange={val => set('improvementTZ', val)}
            />
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 20, marginTop: 8 }}>
            {/* Stock status */}
            <div className="admin-form-group" style={{ marginBottom: 16 }}>
              <label>Склад</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {[
                  { value: 'in_stock',     label: '✅ В наличии',  bg: '#e6f4ea', color: '#2d7a3a', border: '#a8d5b0' },
                  { value: 'out_of_stock', label: '❌ Нет',        bg: '#fff0f0', color: '#c0392b', border: '#f5b7b1' },
                  { value: 'expected',     label: '🕐 Ожидается',  bg: '#fff8e6', color: '#c47a00', border: '#f0c060' },
                ].map(opt => (
                  <label key={opt.value} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${form.stockStatus === opt.value ? opt.border : 'var(--gray-200)'}`,
                    background: form.stockStatus === opt.value ? opt.bg : '#fff',
                    color: form.stockStatus === opt.value ? opt.color : 'var(--slate)',
                    fontWeight: form.stockStatus === opt.value ? 700 : 500,
                    fontSize: 13, transition: 'all .15s',
                  }}>
                    <input type="radio" name="stockStatus" value={opt.value}
                      checked={form.stockStatus === opt.value}
                      onChange={() => set('stockStatus', opt.value)}
                      style={{ display: 'none' }} />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Stock count + Новинка */}
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
              <div className="admin-form-group" style={{ flex: '0 0 140px', margin: 0 }}>
                <label>Остаток (шт)</label>
                <input type="number" min="0" value={form.stock} onChange={e => set('stock', e.target.value)} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: 10 }}>
                <input type="checkbox" checked={form.isNew} onChange={e => set('isNew', e.target.checked)} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>Новинка</span>
              </label>
            </div>
          </div>
        </Card>

        {/* ── ОПИСАНИЕ ── */}
        <Card>
          <SH text="Описание" />
          <div className="admin-form-group">
            <textarea rows={5} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Описание товара..." />
          </div>
        </Card>

        {error && <p style={{ color: 'var(--red)', fontSize: 14, margin: 0 }}>{error}</p>}

        {/* Bottom actions */}
        <div style={{ display: 'flex', gap: 10, paddingBottom: 40 }}>
          {saveBtn}
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Отмена</button>
        </div>

      </div>
    </form>
  );
}
