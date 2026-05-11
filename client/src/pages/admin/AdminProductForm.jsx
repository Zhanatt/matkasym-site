import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  adminGetProduct, adminCreateProduct, adminUpdateProduct,
  adminGetBrands, adminUpdateBrand,
  adminGetCategorySpecs, adminSaveCategorySpec,
  adminGetCustomCategories, adminCreateCustomCategory,
} from '../../api/index';
import ImageUploader  from '../../components/ImageUploader';
import SelectWithAdd  from '../../components/SelectWithAdd';
import { CATEGORIES, CATEGORY_SPECS } from '../../config/categorySpecs';

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
  { value: 'matkasym-home',  label: 'MATKASYM HOME' },
  { value: 'matkasym-shaar', label: 'MATKASYM SHAAR' },
];


const CLOUD_NAME    = 'dnbg21ef8';
const UPLOAD_PRESET = 'Matkasym';

const EMPTY = {
  name: '', fullName: '', sku: '',
  brand: 'matkasym-home', set: '', setLevel: '', color: '',
  category: '',
  dimensions: '',
  specs: [],
  priceCost: '', priceWholesale: '', priceDealer: '', price: '',
  description: '',
  images: [],
  inStock: true, isNew: false, stock: 50, stockStatus: 'in_stock', productStatus: 'for_sale', developmentStage: '',
  developmentTZ: { description: '', files: [] },
  improvementTZ: { problem: '', solution: '', files: [] },
};

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
    <div style={{ marginTop: 20, padding: '16px 20px', borderRadius: 12, border: `1.5px solid ${accent}30`, background: `${accent}08` }}>
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

      {/* Files */}
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
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                >×</button>
              </div>
            ))}
          </div>
        )}

        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 8, cursor: uploading ? 'wait' : 'pointer',
          border: `1.5px dashed ${accent}60`, background: '#fafafa',
          fontSize: 13, fontWeight: 600, color: accent,
          opacity: uploading ? 0.6 : 1,
        }}>
          <input type="file" style={{ display: 'none' }} onChange={handleFileInput} disabled={uploading} />
          {uploading ? '⏳ Загрузка...' : '+ Прикрепить файл'}
        </label>
      </div>
    </div>
  );
}

const sectionLabel = (text) => (
  <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--slate)', marginBottom: -4 }}>
    {text}
  </div>
);

export default function AdminProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = id === 'new';

  const dupData = isNew ? location.state?.duplicate : null;
  const [form, setForm]           = useState(dupData ? { ...EMPTY, ...dupData } : EMPTY);
  const [loading, setLoading]     = useState(!isNew);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  // Brands + sets from DB
  const [brandsData, setBrandsData]   = useState([]);
  const [categories, setCategories]   = useState(CATEGORIES);
  const [savedCatSpecs, setSavedCatSpecs] = useState([]);  // custom specs saved to this category
  const [savingSpec, setSavingSpec]   = useState(null);    // idx of spec being saved

  // Load saved custom specs for current category — defined first, used in useEffect below
  const loadSavedCatSpecs = useCallback((category) => {
    if (!category) return;
    adminGetCategorySpecs(category)
      .then(r => setSavedCatSpecs(r.data))
      .catch(() => {});
  }, []);

  // Load brands for set selector
  useEffect(() => {
    adminGetBrands().then(r => setBrandsData(r.data)).catch(() => {});
  }, []);

  // Load user-created categories from server and merge with static list
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
    if (!id || id === 'undefined' || id === 'null') {
      navigate(-1);
      return;
    }
    adminGetProduct(id)
      .then(r => {
        const p = r.data;
        const baseSpecs = p.specs || [];
        setForm({
          ...p,
          images:        p.images || [],
          specs:         baseSpecs,
          priceCost:     p.priceCost ?? '',
          priceWholesale: p.priceWholesale ?? '',
          priceDealer:   p.priceDealer ?? '',
          dimensions:    p.dimensions || '',
          developmentTZ: p.developmentTZ || { description: '', files: [] },
          improvementTZ: p.improvementTZ || { problem: '', solution: '', files: [] },
        });

        if (p.category) {
          adminGetCategorySpecs(p.category)
            .then(catR => {
              setSavedCatSpecs(catR.data || []);
              // Add saved custom specs that the product doesn't have yet
              const existingKeys = new Set(baseSpecs.map(s => s.key));
              const missing = (catR.data || []).filter(s => !existingKeys.has(s.key));
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

  // When category changes — reset specs to template defaults, merge saved custom specs
  const handleCategoryChange = (value) => {
    const staticSpecs = (CATEGORY_SPECS[value] || []).filter(t => t.key !== 'Цвет');
    adminGetCategorySpecs(value)
      .then(r => {
        setSavedCatSpecs(r.data);
        const allKeys = new Set(staticSpecs.map(t => t.key));
        const extraSpecs = (r.data || [])
          .filter(s => !allKeys.has(s.key))
          .map(s => ({ key: s.key, value: '', options: s.options || [] }));
        setForm(f => ({
          ...f,
          category: value,
          specs: [
            ...staticSpecs.map(t => ({ key: t.key, value: '' })),
            ...extraSpecs,
          ],
        }));
      })
      .catch(() => {
        setSavedCatSpecs([]);
        setForm(f => ({
          ...f,
          category: value,
          specs: staticSpecs.map(t => ({ key: t.key, value: '' })),
        }));
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
    setForm(f => ({ ...f, specs: [...f.specs, { key: '', value: '', options: [] }] }));
  };

  const removeSpec = (idx) => {
    setForm(f => ({ ...f, specs: f.specs.filter((_, i) => i !== idx) }));
  };

  // Save custom spec to category template
  const saveSpecToCategory = async (idx) => {
    const spec = form.specs[idx];
    if (!spec.key.trim() || !form.category) return;
    setSavingSpec(idx);
    try {
      const type = spec.options?.length > 0 ? 'select' : 'text';
      const result = await adminSaveCategorySpec(form.category, {
        key: spec.key.trim(),
        type,
        options: spec.options?.filter(Boolean) || [],
      });
      setSavedCatSpecs(result.data);
    } finally {
      setSavingSpec(null);
    }
  };

  // Sets for current brand
  const currentBrand  = brandsData.find(b => b.key === form.brand);
  const setOptions    = (currentBrand?.sets || [])
    .sort((a, b) => a.order - b.order)
    .map(s => ({ value: s.key, label: `${s.label}${s.labelRu ? ` — ${s.labelRu}` : ''}` }));

  // Level options for current set
  const currentSet    = currentBrand?.sets?.find(s => s.key === form.set);
  const levelOptions  = (currentSet?.levels || []).map(l => ({ value: l.toLowerCase(), label: l }));

  // Add new set → save to brand in DB
  const handleAddSet = async ({ value, label }) => {
    if (!currentBrand) return;
    const newSet = { key: value, label: label.toUpperCase(), labelRu: '', levels: [], order: (currentBrand.sets?.length || 0) + 1 };
    const updatedSets = [...(currentBrand.sets || []), newSet];
    await adminUpdateBrand(currentBrand.key, { sets: updatedSets });
    setBrandsData(prev => prev.map(b => b.key === currentBrand.key ? { ...b, sets: updatedSets } : b));
  };

  // Add new level → save to set in brand
  const handleAddLevel = async ({ label }) => {
    if (!currentBrand || !currentSet) return;
    const updatedSets = currentBrand.sets.map(s =>
      s.key === currentSet.key ? { ...s, levels: [...s.levels, label] } : s
    );
    await adminUpdateBrand(currentBrand.key, { sets: updatedSets });
    setBrandsData(prev => prev.map(b => b.key === currentBrand.key ? { ...b, sets: updatedSets } : b));
  };

  // Add new category — persist to server so it survives page reloads
  const handleAddCategory = async ({ value, label }) => {
    setCategories(prev => [...prev, { value, label }]);
    try {
      await adminCreateCustomCategory({ value, label });
    } catch (e) {
      console.error('Failed to save category:', e);
    }
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
        priceCost:      Number(form.priceCost) || 0,
        priceWholesale: Number(form.priceWholesale) || 0,
        priceDealer:    Number(form.priceDealer) || 0,
        price:          Number(form.price),
        stock:          Number(form.stock) || 0,
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

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">{isNew ? 'Новый товар' : 'Редактировать товар'}</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Назад</button>
      </div>

      <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-200)', padding: 32, maxWidth: 720 }}>
        <form className="admin-form" onSubmit={handleSubmit}>

          {sectionLabel('Основное')}

          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Короткое название *</label>
              <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="TAZA KIYM Standard" />
            </div>
            <div className="admin-form-group">
              <label>SKU</label>
              <input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="TK-STD-W" />
            </div>
          </div>

          <div className="admin-form-group">
            <label>Полное название *</label>
            <input required value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="MATKASYM HOME — TAZA KIYM Standard (белый)" />
          </div>

          {sectionLabel('Принадлежность')}

          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Бренд *</label>
              <select
                value={form.brand}
                onChange={e => { set('brand', e.target.value); set('set', ''); set('setLevel', ''); }}
              >
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
            <div className="admin-form-group">
              <label>Уровень сета</label>
              <SelectWithAdd
                options={levelOptions}
                value={form.setLevel}
                onChange={v => set('setLevel', v)}
                onAdd={handleAddLevel}
                placeholder={form.set ? 'Выберите уровень...' : 'Сначала выберите сет'}
              />
            </div>
          </div>

          <div className="admin-form-group">
            <label>Цвет</label>
            <select value={form.color} onChange={e => set('color', e.target.value)}>
              <option value="">— не выбран —</option>
              <option value="white">Белый</option>
              <option value="black">Чёрный</option>
              <option value="grey">Серый</option>
              <option value="brown">Коричневый</option>
              <option value="beige">Бежевый</option>
              <option value="red">Красный</option>
              <option value="blue">Синий</option>
              <option value="green">Зелёный</option>
              <option value="gold">Золотой</option>
              <option value="silver">Серебряный</option>
            </select>
          </div>

          {/* Габариты */}
          <div className="admin-form-group">
            <label>Габариты (ДxШxВ)</label>
            <input
              value={form.dimensions}
              onChange={e => set('dimensions', e.target.value)}
              placeholder="134x55x108 см"
            />
          </div>

          {/* Характеристики по категории + пользовательские */}
          {sectionLabel('Характеристики')}
          <div className="admin-specs-grid">
            {form.specs.map((spec, idx) => {
              if (spec.key === 'Цвет') return null;
              const template = (CATEGORY_SPECS[form.category] || []).find(t => t.key === spec.key);
              const isCustom = !template;
              const isSelect = template?.type === 'select' || (isCustom && spec.options?.length > 0);

              return (
                <div className="admin-form-group" key={idx} style={{ position: 'relative' }}>
                  {/* Имя свойства */}
                  {isCustom ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <input
                        value={spec.key}
                        onChange={e => setSpec(idx, 'key', e.target.value)}
                        placeholder="Название свойства"
                        style={{ flex: 1, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--slate)', border: '1px dashed var(--gray-300)', borderRadius: 6, padding: '3px 8px', background: '#fafafa' }}
                      />
                      {/* ОК — сохранить свойство в шаблон категории */}
                      {spec.key.trim() && form.category && !savedCatSpecs.some(s => s.key === spec.key.trim()) && (
                        <button
                          type="button"
                          onClick={() => saveSpecToCategory(idx)}
                          disabled={savingSpec === idx}
                          style={{
                            fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                            border: '1.5px solid #2d7a3a', background: savingSpec === idx ? '#e6f4ea' : '#2d7a3a',
                            color: savingSpec === idx ? '#2d7a3a' : '#fff',
                            fontWeight: 700, flexShrink: 0,
                          }}
                          title="Сохранить в шаблон категории"
                        >{savingSpec === idx ? '...' : 'ОК'}</button>
                      )}
                      {spec.key.trim() && savedCatSpecs.some(s => s.key === spec.key.trim()) && (
                        <span style={{ fontSize: 11, color: '#2d7a3a', fontWeight: 700, flexShrink: 0 }}>✓ сохранено</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeSpec(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                        title="Удалить"
                      >×</button>
                    </div>
                  ) : (
                    <label>
                      {spec.key}
                      {template?.unit && <span style={{ color: 'var(--slate)', fontWeight: 400, marginLeft: 4 }}>({template.unit})</span>}
                    </label>
                  )}

                  {/* Тип ввода для пользовательских свойств */}
                  {isCustom && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      {['text', 'select'].map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSpec(idx, 'options', t === 'select' ? (spec.options?.length ? spec.options : ['']) : [])}
                          style={{
                            fontSize: 11, padding: '2px 10px', borderRadius: 12, cursor: 'pointer',
                            border: `1.5px solid ${(t === 'select') === isSelect ? 'var(--primary)' : 'var(--gray-200)'}`,
                            background: (t === 'select') === isSelect ? 'var(--primary)' : '#fff',
                            color: (t === 'select') === isSelect ? '#fff' : 'var(--slate)',
                            fontWeight: 600,
                          }}
                        >{t === 'text' ? 'Текст' : 'Список'}</button>
                      ))}
                    </div>
                  )}

                  {/* Редактирование вариантов списка */}
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
                          <button
                            type="button"
                            onClick={() => setSpec(idx, 'options', spec.options.filter((_, i) => i !== oi))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 14, padding: '0 2px' }}
                          >×</button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSpec(idx, 'options', [...spec.options, ''])}
                        style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px dashed var(--gray-300)', background: '#fafafa', cursor: 'pointer', color: 'var(--slate)' }}
                      >+ вариант</button>
                    </div>
                  )}

                  {/* Значение */}
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

          <button
            type="button"
            onClick={addCustomSpec}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, padding: '8px 16px', borderRadius: 8,
              border: '1.5px dashed var(--gray-300)', background: '#fafafa',
              cursor: 'pointer', color: 'var(--slate)', fontWeight: 600,
              marginBottom: 8,
            }}
          >
            + Добавить свойство
          </button>

          {sectionLabel('Цены (сом)')}

          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Себестоимость</label>
              <input type="number" min="0" value={form.priceCost} onChange={e => set('priceCost', e.target.value)} placeholder="0" />
            </div>
            <div className="admin-form-group">
              <label>Оптовая цена</label>
              <input type="number" min="0" value={form.priceWholesale} onChange={e => set('priceWholesale', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Дилерская цена</label>
              <input type="number" min="0" value={form.priceDealer} onChange={e => set('priceDealer', e.target.value)} placeholder="0" />
            </div>
            <div className="admin-form-group">
              <label>Розничная цена * <span style={{ color: 'var(--slate)', fontWeight: 400, fontSize: 11 }}>(на сайте)</span></label>
              <input required type="number" min="0" value={form.price} onChange={e => set('price', e.target.value)} placeholder="15000" />
            </div>
          </div>

          {sectionLabel('Фотографии')}

          <ImageUploader images={form.images} onChange={urls => set('images', urls)} />

          <div className="admin-form-group">
            <label>Описание</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Описание товара..." />
          </div>

          {sectionLabel('Статус')}

          <div className="admin-form-group">
            <label>Склад</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { value: 'in_stock',     label: '✅ В наличии',     bg: '#e6f4ea', color: '#2d7a3a', border: '#a8d5b0' },
                { value: 'out_of_stock', label: '❌ Нет в наличии', bg: '#fff0f0', color: '#c0392b', border: '#f5b7b1' },
                { value: 'expected',     label: '🕐 Ожидается',     bg: '#fff8e6', color: '#c47a00', border: '#f0c060' },
              ].map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
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

          <div className="admin-form-group">
            <label>Статус товара</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { value: 'for_sale',       label: '🛒 В продаже',            bg: '#e6f4ea', color: '#2d7a3a', border: '#a8d5b0' },
                { value: 'planned',        label: '📋 В плане',              bg: '#eef2ff', color: '#3b5bdb', border: '#bfcbfb' },
                { value: 'in_development', label: '🔨 В разработке',         bg: '#f3e8ff', color: '#7c3aed', border: '#c4b5fd' },
                { value: 'improvement',    label: '🔧 На улучшении',         bg: '#fff8e6', color: '#c47a00', border: '#f0c060' },
                { value: 'discontinued',   label: '🚫 Снят с производства',  bg: '#f5f5f5', color: '#888',    border: '#ccc'    },
                { value: 'liquidation',    label: '🔴 ЛИКВИДАЦИЯ',            bg: '#fff0f0', color: '#c0392b', border: '#e74c3c' },
              ].map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
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
            {form.productStatus === 'in_development' && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Этап разработки (CRM)
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CRM_STAGES.map((stage, i) => {
                    const active = form.developmentStage === stage;
                    return (
                      <button
                        key={stage}
                        type="button"
                        onClick={() => set('developmentStage', active ? '' : stage)}
                        style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 13,
                          fontWeight: active ? 700 : 500,
                          border: active ? '2px solid #7c3aed' : '1.5px solid var(--gray-200)',
                          background: active ? '#f3e8ff' : '#fff',
                          color: active ? '#7c3aed' : '#555',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 11, background: active ? '#7c3aed' : '#ddd', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                          {i + 1}
                        </span>
                        {stage}
                      </button>
                    );
                  })}
                </div>

                {/* TZ block for in_development */}
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
          </div>

          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Остаток (шт)</label>
              <input type="number" min="0" value={form.stock} onChange={e => set('stock', e.target.value)} />
            </div>
            <div className="admin-form-group" style={{ justifyContent: 'flex-end', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', fontSize: 14 }}>
                <input type="checkbox" checked={form.inStock} onChange={e => set('inStock', e.target.checked)} />
                В наличии
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', fontSize: 14 }}>
                <input type="checkbox" checked={form.isNew} onChange={e => set('isNew', e.target.checked)} />
                Новинка
              </label>
            </div>
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: 14 }}>{error}</p>}

          <div className="admin-form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Сохранение...' : isNew ? 'Создать товар' : 'Сохранить изменения'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
