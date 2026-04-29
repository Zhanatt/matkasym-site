import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  adminGetProduct, adminCreateProduct, adminUpdateProduct,
  adminGetBrands, adminUpdateBrand,
} from '../../api/index';
import ImageUploader  from '../../components/ImageUploader';
import SelectWithAdd  from '../../components/SelectWithAdd';
import { CATEGORIES, CATEGORY_SPECS } from '../../config/categorySpecs';

const BRAND_OPTIONS = [
  { value: 'matkasym-home',  label: 'MATKASYM HOME' },
  { value: 'matkasym-shaar', label: 'MATKASYM SHAAR' },
];


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
};

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
  const [brandsData, setBrandsData] = useState([]);  // full brand objects
  const [categories, setCategories] = useState(CATEGORIES);

  // Load brands for set selector
  useEffect(() => {
    adminGetBrands().then(r => setBrandsData(r.data)).catch(() => {});
  }, []);

  // Load product for edit
  useEffect(() => {
    if (isNew) return;
    adminGetProduct(id)
      .then(r => {
        const p = r.data;
        setForm({ ...p, images: p.images || [], specs: p.specs || [], priceCost: p.priceCost ?? '', priceWholesale: p.priceWholesale ?? '', priceDealer: p.priceDealer ?? '', dimensions: p.dimensions || '' });
      })
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  // When category changes — reset specs to template defaults (skip Цвет — handled separately)
  const handleCategoryChange = (value) => {
    set('category', value);
    const template = (CATEGORY_SPECS[value] || []).filter(t => t.key !== 'Цвет');
    setForm(f => ({
      ...f,
      category: value,
      specs: template.map(t => ({ key: t.key, value: '' })),
    }));
  };

  const setSpec = (idx, value) => {
    setForm(f => {
      const specs = [...f.specs];
      specs[idx] = { ...specs[idx], value };
      return { ...f, specs };
    });
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

  // Add new category
  const handleAddCategory = ({ value, label }) => {
    setCategories(prev => [...prev, { value, label }]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        priceCost:      Number(form.priceCost) || 0,
        priceWholesale: Number(form.priceWholesale) || 0,
        priceDealer:    Number(form.priceDealer) || 0,
        price:          Number(form.price),
        stock:          Number(form.stock) || 0,
      };
      if (isNew) await adminCreateProduct(payload);
      else       await adminUpdateProduct(id, payload);
      navigate('/admin/products');
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
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/products')}>← Назад</button>
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

          {/* Характеристики по категории */}
          {form.specs.some(s => s.key !== 'Цвет') && (
            <>
              {sectionLabel('Характеристики')}
              <div className="admin-specs-grid">
                {form.specs.map((spec, idx) => {
                  if (spec.key === 'Цвет') return null;
                  const template = (CATEGORY_SPECS[form.category] || []).find(t => t.key === spec.key);
                  return (
                    <div className="admin-form-group" key={spec.key}>
                      <label>
                        {spec.key}
                        {template?.unit && <span style={{ color: 'var(--slate)', fontWeight: 400, marginLeft: 4 }}>({template.unit})</span>}
                      </label>
                      {template?.type === 'select' ? (
                        <select value={spec.value} onChange={e => setSpec(idx, e.target.value)}>
                          <option value="">— выберите —</option>
                          {template.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={template?.type === 'number' ? 'number' : 'text'}
                          value={spec.value}
                          onChange={e => setSpec(idx, e.target.value)}
                          placeholder={template?.unit || ''}
                          min={template?.type === 'number' ? 0 : undefined}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

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
                { value: 'in_stock',     label: 'В наличии',     bg: '#e6f4ea', color: '#2d7a3a', border: '#a8d5b0' },
                { value: 'out_of_stock', label: 'Нет в наличии', bg: '#fff0f0', color: '#c0392b', border: '#f5b7b1' },
                { value: 'expected',     label: 'Ожидается',     bg: '#fff8e6', color: '#c47a00', border: '#f0c060' },
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
                { value: 'for_sale',       label: 'В продаже',            bg: '#e6f4ea', color: '#2d7a3a', border: '#a8d5b0' },
                { value: 'planned',        label: 'В плане',              bg: '#eef2ff', color: '#3b5bdb', border: '#bfcbfb' },
                { value: 'in_development', label: 'В разработке',         bg: '#f3e8ff', color: '#7c3aed', border: '#c4b5fd' },
                { value: 'improvement',    label: 'На улучшении',         bg: '#fff8e6', color: '#c47a00', border: '#f0c060' },
                { value: 'discontinued',   label: 'Снят с производства',  bg: '#f5f5f5', color: '#888',    border: '#ccc'    },
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
              <div style={{ marginTop: 10 }}>
                <input
                  className="admin-input"
                  placeholder="Этап разработки (напр. производство, моделирование, чертеж)"
                  value={form.developmentStage || ''}
                  onChange={e => set('developmentStage', e.target.value)}
                  style={{ maxWidth: 400 }}
                />
              </div>
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
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/admin/products')}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
