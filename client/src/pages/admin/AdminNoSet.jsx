import { useEffect, useMemo, useState } from 'react';
import { adminGetProducts, adminGetBrands, adminUpdateProduct } from '../../api/index';
import AdminProductModal from './AdminProductModal';
import { cloudinaryOpt } from '../../utils/drive';

const NO_PHOTO = '/logos/no-photo.png';

const BRAND_LABEL = {
  'matkasym-home':   'HOME',
  'matkasym-shaar':  'SHAAR',
  'matkasym-kyzmat': 'KYZMAT',
};

// Разбор товаров без сета.
//
// Раньше сюда вёл общий каталог с фильтром: список видно, а разложить нельзя —
// в каждую карточку надо было зайти, найти поле, выбрать, сохранить, вернуться.
// На сотню товаров это несколько часов.
//
// Здесь наоборот: сет выбирается один раз сверху, дальше товар кладётся одним
// касанием по строке. Порядок «куда → что» держит палец на месте и потому
// работает на телефоне: не надо целиться в мелкие выпадашки в каждой строке.
export default function AdminNoSet() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [brandSets, setBrandSets] = useState({});
  const [brand,   setBrand]   = useState('matkasym-home');   // куда кладём, а не фильтр
  const [target,  setTarget]  = useState('');      // сет, куда кладём
  const [saving,  setSaving]  = useState(null);    // id товара в работе
  const [undo,    setUndo]    = useState(null);    // { product, prevSet }
  const [detail,  setDetail]  = useState(null);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    Promise.all([
      adminGetProducts({ set: '__none__', limit: 1000, brief: '1' }),
      adminGetBrands(),
    ])
      .then(([p, b]) => {
        setItems(p.data.products || []);
        const map = {};
        (b.data || []).forEach(x => {
          // Берём label — имя сета как оно есть («ACHYK ASMAN»). labelRu не трогаем:
          // это перевод для витрины, а сет — имя собственное; в служебном списке
          // «Открытое небо» вперемешку с «TAZA KIYIM» только путает.
          map[x.key] = (x.sets || []).map(s => ({ key: s.key, label: s.label || s.key }));
        });
        setBrandSets(map);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  // Сет принадлежит бренду: показывать чужие — тот же способ потерять товар.
  useEffect(() => { setTarget(''); }, [brand]);

  // Список по бренду не режем: разобрать надо все, а бренд наверху — это куда
  // кладём. Товар может уехать в другой бренд, если его туда и заводили.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(p => (p.fullName || p.name || '').toLowerCase().includes(q)
                          || (p.sku || '').toLowerCase().includes(q));
  }, [items, search]);

  const assign = async (p) => {
    if (!target || saving) return;
    setSaving(p._id);
    try {
      // Бренд пишем вместе с сетом: сет принадлежит бренду, и товар, оставшийся
      // в прежнем, снова выпал бы из каталога — уже по другой причине.
      await adminUpdateProduct(p._id, { brand, set: target });
      setItems(prev => prev.filter(x => x._id !== p._id));
      setUndo({ product: p });
    } catch (e) {
      alert('Не удалось сохранить: ' + (e.response?.data?.error || e.message));
    } finally { setSaving(null); }
  };

  // Промах пальцем стоит дёшево, только если его можно отменить.
  const undoLast = async () => {
    if (!undo) return;
    const p = undo.product;
    setUndo(null);
    try {
      await adminUpdateProduct(p._id, { brand: p.brand, set: '' });
      setItems(prev => [p, ...prev]);
    } catch { /* вернём при следующей загрузке */ }
  };

  const sets = brandSets[brand] || [];

  return (
    <div style={{ paddingBottom: 90 }}>
      <h1 className="admin-page-title">Товары без сета</h1>
      <div style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 16 }}>
        Такой товар не попадает в каталог по сетам — его не видно ни в выгрузках, ни на витрине.
        Выберите бренд и сет, потом нажимайте на товары — каждый уходит туда сразу. Если сет чужого бренда, товар переедет и в него.
      </div>

      {/* Панель липкая: на телефоне список длинный, а выбор сета нужен всё время */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, background: 'var(--admin-bg, #f6f7f9)',
        padding: '10px 0', marginBottom: 10,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#8b98a5' }}>Куда кладём:</span>
          {Object.keys(BRAND_LABEL).map(b => (
            <button key={b} onClick={() => setBrand(b)} style={{
              padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${brand === b ? '#3463A3' : '#e0e0e0'}`,
              background: brand === b ? '#eef2f7' : '#fff',
              color: brand === b ? '#3463A3' : '#555',
            }}>{BRAND_LABEL[b]}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <select value={target} onChange={e => setTarget(e.target.value)}
            style={{
              flex: '1 1 220px', padding: '12px 14px', borderRadius: 10, fontSize: 15, fontWeight: 700,
              border: `2px solid ${target ? '#2d7a3a' : '#f0a0a0'}`,
              background: target ? '#f0faf2' : '#fff5f5',
            }}>
            <option value="">— куда кладём? выберите сет —</option>
            {sets.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию или артикулу"
            style={{
              flex: '1 1 180px', padding: '12px 14px', borderRadius: 10, fontSize: 14,
              border: '1.5px solid #e0e0e0', outline: 'none',
            }} />
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#999', fontSize: 14 }}>Загрузка…</div>
      ) : !shown.length ? (
        <div style={{
          background: '#f0faf2', border: '1.5px solid #b7e0c2', borderRadius: 12,
          padding: '18px 20px', fontSize: 14, color: '#2d7a3a', fontWeight: 600,
        }}>
          {items.length ? 'В этом бренде разбирать нечего.' : 'Все товары разложены по сетам.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(p => (
            <div key={p._id}
              onClick={() => assign(p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#fff', border: '1px solid #eceff3', borderRadius: 12,
                padding: 10, cursor: target ? 'pointer' : 'default',
                opacity: saving === p._id ? .5 : 1,
              }}>
              <img
                src={cloudinaryOpt(p.images?.[0] || NO_PHOTO, 120)}
                alt=""
                onError={e => { e.target.src = NO_PHOTO; }}
                style={{
                  width: 56, height: 56, borderRadius: 10, objectFit: 'contain',
                  background: '#f6f7f9', flexShrink: 0,
                }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111', lineHeight: 1.3 }}>
                  {p.fullName || p.name}
                </div>
                <div style={{ fontSize: 11, color: '#aab3bd', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span>{p.sku || 'без артикула'} · {p.stock > 0 ? `${p.stock} ${p.unit || 'шт'}.` : 'нет остатка'}</span>
                  {/* Сейчас товар в этом бренде. Если кладём в другой — он туда
                      и переедет, и это должно быть видно до нажатия. */}
                  {p.brand !== brand && (
                    <span style={{ color: '#b45309', fontWeight: 700 }}>
                      {BRAND_LABEL[p.brand] || p.brand} → {BRAND_LABEL[brand]}
                    </span>
                  )}
                </div>
              </div>

              {/* Подробности — отдельной кнопкой: нажатие по строке уже занято
                  раскладкой, и открывать карточку им нельзя. */}
              <button
                onClick={e => { e.stopPropagation(); setDetail(p); }}
                title="Подробнее о товаре"
                style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  border: '1.5px solid #e0e0e0', background: '#fff',
                  fontSize: 15, cursor: 'pointer',
                }}>ⓘ</button>
            </div>
          ))}
        </div>
      )}

      {/* Итог и отмена — внизу, под большим пальцем */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 6,
        background: '#fff', borderTop: '1px solid #eceff3',
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>
          Осталось: {items.length}
        </span>
        {!target && (
          <span style={{ fontSize: 12, color: '#c0392b' }}>сначала выберите сет</span>
        )}
        {undo && (
          <button onClick={undoLast} style={{
            marginLeft: 'auto', padding: '9px 16px', borderRadius: 10,
            border: '1.5px solid #e0e0e0', background: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>↩ Вернуть «{(undo.product.fullName || undo.product.name || '').slice(0, 22)}…»</button>
        )}
      </div>

      {detail && (
        <AdminProductModal
          product={detail}
          onClose={() => setDetail(null)}
          onDeleted={id => { setItems(prev => prev.filter(x => x._id !== id)); setDetail(null); }}
        />
      )}
    </div>
  );
}
