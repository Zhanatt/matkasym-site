import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminCreateNews, adminGetUsers, adminGetProducts } from '../../api';

const TYPE_META = {
  discontinued: { label: 'Снят с производства', color: '#c0392b', bg: '#fdf0ef' },
  liquidation:  { label: 'Ликвидация',           color: '#e67e22', bg: '#fef6ec' },
  nelikvid:     { label: 'Неликвид',             color: '#8e44ad', bg: '#f5eef8' },
  out_of_stock: { label: 'Нет в наличии',         color: '#7f8c8d', bg: '#f2f3f4' },
  restocked:    { label: 'Появился на складе',    color: '#27ae60', bg: '#eafaf1' },
  price_change: { label: 'Изменение цены',        color: '#2980b9', bg: '#eaf4fb' },
  custom:       { label: 'Объявление',            color: '#2c3e50', bg: '#f0f3f4' },
};

const TYPE_TITLES = {
  discontinued: (name) => name ? `${name} снят с производства` : 'Снят с производства',
  liquidation:  (name) => name ? `${name} — ликвидация остатков` : 'Ликвидация остатков',
  nelikvid:     (name) => name ? `${name} признан неликвидом` : 'Неликвид',
  out_of_stock: (name) => name ? `${name} — нет на складе` : 'Нет в наличии',
  restocked:    (name) => name ? `${name} снова в наличии` : 'Появился на складе',
  price_change: (name) => name ? `Изменение цены: ${name}` : 'Изменение цены',
  custom:       ()     => '',
};

function productImg(p) {
  if (!p) return null;
  if (p.images?.[0]) return p.images[0];
  if (p.driveImages?.[0]) return `https://drive.google.com/uc?export=view&id=${p.driveImages[0]}`;
  return null;
}

const ROLE_LABELS = { owner: 'Владелец', editor: 'Редактор', viewer: 'Просмотр' };

export default function AdminNewsCreate() {
  const navigate = useNavigate();

  const [type,         setType]         = useState('discontinued');
  const [productQ,     setProductQ]     = useState('');
  const [products,     setProducts]     = useState([]);
  const [prodLoading,  setProdLoading]  = useState(false);
  const [selectedProd, setSelectedProd] = useState(null);
  const [title,        setTitle]        = useState('снят с производства');
  const [message,      setMessage]      = useState('');
  const [users,        setUsers]        = useState([]);
  const [selected,     setSelected]     = useState(new Set());
  const [usersLoaded,  setUsersLoaded]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const prodDebounce = useRef(null);

  useEffect(() => {
    adminGetUsers().then(r => {
      const eligible = (r.data || []).filter(u => ['owner','editor','viewer'].includes(u.role) && !u.isPending);
      setUsers(eligible);
      setSelected(new Set(eligible.map(u => u._id)));
      setUsersLoaded(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(prodDebounce.current);
    if (!productQ.trim()) { setProducts([]); return; }
    prodDebounce.current = setTimeout(() => {
      setProdLoading(true);
      adminGetProducts({ search: productQ, limit: 10 })
        .then(r => setProducts(r.data.products || r.data || []))
        .catch(() => {})
        .finally(() => setProdLoading(false));
    }, 300);
  }, [productQ]);

  useEffect(() => {
    const name = selectedProd ? (selectedProd.fullName || selectedProd.name) : '';
    setTitle(TYPE_TITLES[type]?.(name) || '');
  }, [type, selectedProd]);

  const toggleUser = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    setSelected(selected.size === users.length ? new Set() : new Set(users.map(u => u._id)));
  };

  const submit = async () => {
    if (!title.trim()) { setError('Заполните заголовок'); return; }
    if (selected.size === 0) { setError('Выберите хотя бы одного получателя'); return; }
    setSaving(true); setError('');
    try {
      await adminCreateNews({
        type,
        title: title.trim(),
        message: message.trim(),
        productId: selectedProd?._id || null,
        recipientIds: [...selected],
      });
      navigate('/admin/news');
    } catch (e) {
      setError(e.response?.data?.message || 'Ошибка при создании');
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 0 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button onClick={() => navigate('/admin/news')} style={{
          background: 'none', border: '1.5px solid #e0e0e0', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#555', fontWeight: 600,
        }}>← Назад</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Создать новость</h1>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 1px 6px rgba(0,0,0,.07)' }}>

        {/* Type */}
        <label style={{ fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 10 }}>Тип события</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {Object.entries(TYPE_META).map(([k, v]) => (
            <button key={k} onClick={() => setType(k)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: type === k ? `2px solid ${v.color}` : '2px solid #e0e0e0',
              background: type === k ? v.bg : '#fff',
              color: type === k ? v.color : '#888',
              transition: 'all .15s',
            }}>{v.label}</button>
          ))}
        </div>

        {/* Product */}
        <label style={{ fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 8 }}>
          Товар <span style={{ color: '#bbb', fontWeight: 400 }}>(необязательно)</span>
        </label>
        {selectedProd ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f7f8fa', border: '1.5px solid #e0e0e0', borderRadius: 10, padding: '10px 14px', marginBottom: 24 }}>
            {productImg(selectedProd) && <img src={productImg(selectedProd)} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{selectedProd.fullName || selectedProd.name}</div>
              <div style={{ fontSize: 12, color: '#7d96a0', marginTop: 2 }}>Остаток: {selectedProd.stock ?? '—'} шт.</div>
            </div>
            <button onClick={() => { setSelectedProd(null); setProductQ(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 20 }}>×</button>
          </div>
        ) : (
          <div style={{ position: 'relative', marginBottom: 24 }}>
            <input
              value={productQ}
              onChange={e => setProductQ(e.target.value)}
              placeholder="Поиск по названию..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
            {(products.length > 0 || prodLoading) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #e0e0e0', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,.1)', zIndex: 10, maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
                {prodLoading && <div style={{ padding: '12px 16px', fontSize: 13, color: '#aaa' }}>Поиск...</div>}
                {products.map(p => (
                  <button key={p._id} onClick={() => { setSelectedProd(p); setProductQ(''); setProducts([]); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f4f4f4' }}>
                    {productImg(p) && <img src={productImg(p)} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{p.fullName || p.name}</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>Остаток: {p.stock ?? '—'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Title */}
        <label style={{ fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 8 }}>Заголовок *</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Заголовок новости"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', marginBottom: 24, boxSizing: 'border-box' }}
        />

        {/* Message */}
        <label style={{ fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 8 }}>
          Сообщение <span style={{ color: '#bbb', fontWeight: 400 }}>(необязательно)</span>
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Подробности, инструкции, комментарии..."
          rows={4}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', marginBottom: 24, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
        />

        {/* Recipients */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#666' }}>
            Получатели <span style={{ color: '#bbb', fontWeight: 400 }}>({selected.size} из {users.length})</span>
          </label>
          <button onClick={toggleAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#3463A3', fontWeight: 600, padding: 0 }}>
            {selected.size === users.length ? 'Снять все' : 'Выбрать все'}
          </button>
        </div>
        {!usersLoaded ? (
          <div style={{ padding: '14px 0', fontSize: 13, color: '#aaa' }}>Загрузка...</div>
        ) : (
          <div style={{ border: '1.5px solid #e0e0e0', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
            {users.map((u, i) => (
              <label key={u._id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer',
                borderBottom: i < users.length - 1 ? '1px solid #f4f4f4' : 'none',
                background: selected.has(u._id) ? '#f7fbff' : '#fff',
                transition: 'background .1s',
              }}>
                <input type="checkbox" checked={selected.has(u._id)} onChange={() => toggleUser(u._id)}
                  style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: '#3463A3' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: '#aaa' }}>{u.email}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, background: '#f0f0f0', color: '#777', padding: '3px 9px', borderRadius: 10, flexShrink: 0 }}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
              </label>
            ))}
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: '#c0392b', marginBottom: 20, background: '#fdf0ef', padding: '10px 14px', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={() => navigate('/admin/news')} style={{
            padding: '11px 22px', borderRadius: 10, border: '1.5px solid #e0e0e0',
            background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#555',
          }}>Отмена</button>
          <button onClick={submit} disabled={saving} style={{
            padding: '11px 28px', borderRadius: 10, border: 'none',
            background: saving ? '#aaa' : '#111',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? 'Отправка...' : `Опубликовать (${selected.size})`}
          </button>
        </div>

      </div>
    </div>
  );
}
