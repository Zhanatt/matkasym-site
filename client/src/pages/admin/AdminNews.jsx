import { useState, useEffect, useCallback, useRef } from 'react';
import {
  adminGetNews, adminCreateNews, adminMarkNewsRead, adminMarkAllNewsRead,
  adminDeleteNews, adminGetUsers, adminGetProducts,
} from '../../api';
import { useAuth } from '../../context/AuthContext';

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
  discontinued: (name) => `${name} снят с производства`,
  liquidation:  (name) => `${name} — ликвидация остатков`,
  nelikvid:     (name) => `${name} признан неликвидом`,
  out_of_stock: (name) => `${name} — нет на складе`,
  restocked:    (name) => `${name} снова в наличии`,
  price_change: (name) => `Изменение цены: ${name}`,
  custom:       ()     => '',
};

function productImg(p) {
  if (!p) return null;
  if (p.images?.[0]) return p.images[0];
  if (p.driveImages?.[0]) return `https://drive.google.com/uc?export=view&id=${p.driveImages[0]}`;
  return null;
}

function fmt(d) {
  const dt = new Date(d);
  return dt.toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(diff / 3600000);
  const day  = Math.floor(diff / 86400000);
  if (min < 1)  return 'только что';
  if (min < 60) return `${min} мин. назад`;
  if (hr  < 24) return `${hr} ч. назад`;
  if (day < 7)  return `${day} дн. назад`;
  return fmt(d);
}

const canEdit = (role) => ['owner', 'editor'].includes(role);

// ── Create news modal ────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }) {
  const [type,        setType]        = useState('discontinued');
  const [productQ,    setProductQ]    = useState('');
  const [products,    setProducts]    = useState([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [selectedProd, setSelectedProd] = useState(null);
  const [title,       setTitle]       = useState('');
  const [message,     setMessage]     = useState('');
  const [users,       setUsers]       = useState([]);
  const [selected,    setSelected]    = useState(new Set()); // selected user IDs
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const prodDebounce = useRef(null);

  // Load users once
  useEffect(() => {
    adminGetUsers().then(r => {
      const eligible = (r.data || []).filter(u => ['owner','editor','viewer'].includes(u.role) && !u.isPending);
      setUsers(eligible);
      setSelected(new Set(eligible.map(u => u._id)));
      setUsersLoaded(true);
    }).catch(() => {});
  }, []);

  // Search products
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

  // Auto-fill title when type or product changes
  useEffect(() => {
    const name = selectedProd ? (selectedProd.fullName || selectedProd.name) : '';
    const gen  = TYPE_TITLES[type]?.(name) || '';
    setTitle(gen);
  }, [type, selectedProd]);

  const toggleUser = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (selected.size === users.length) setSelected(new Set());
    else setSelected(new Set(users.map(u => u._id)));
  };

  const submit = async () => {
    if (!title.trim()) { setError('Заполните заголовок'); return; }
    if (selected.size === 0) { setError('Выберите хотя бы одного получателя'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        type,
        title: title.trim(),
        message: message.trim(),
        productId: selectedProd?._id || null,
        recipientIds: [...selected],
      };
      const r = await adminCreateNews(payload);
      onCreated(r.data.news);
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || 'Ошибка при создании');
    } finally {
      setSaving(false);
    }
  };

  const ROLE_LABELS = { owner: 'Владелец', editor: 'Редактор', viewer: 'Просмотр' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.18)', overflow: 'hidden' }}>
      <div style={{ overflowY: 'auto', padding: 28, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Создать новость</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#aaa', lineHeight: 1 }}>×</button>
        </div>

        {/* Type */}
        <label style={{ fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 6 }}>Тип события</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {Object.entries(TYPE_META).map(([k, v]) => (
            <button key={k} onClick={() => setType(k)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: type === k ? `2px solid ${v.color}` : '2px solid #e0e0e0',
              background: type === k ? v.bg : '#fff',
              color: type === k ? v.color : '#888',
              transition: 'all .15s',
            }}>{v.label}</button>
          ))}
        </div>

        {/* Product search */}
        <label style={{ fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 6 }}>Товар <span style={{ color: '#bbb', fontWeight: 400 }}>(необязательно)</span></label>
        {selectedProd ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f7f8fa', border: '1.5px solid #e0e0e0', borderRadius: 8, padding: '8px 12px', marginBottom: 20 }}>
            {productImg(selectedProd) && <img src={productImg(selectedProd)} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedProd.fullName || selectedProd.name}</div>
              <div style={{ fontSize: 11, color: '#7d96a0' }}>Остаток: {selectedProd.stock ?? '—'} шт.</div>
            </div>
            <button onClick={() => { setSelectedProd(null); setProductQ(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 18, flexShrink: 0 }}>×</button>
          </div>
        ) : (
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <input
              value={productQ}
              onChange={e => setProductQ(e.target.value)}
              placeholder="Поиск по названию..."
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
            {(products.length > 0 || prodLoading) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #e0e0e0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 10, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                {prodLoading && <div style={{ padding: '10px 14px', fontSize: 12, color: '#aaa' }}>Поиск...</div>}
                {products.map(p => (
                  <button key={p._id} onClick={() => { setSelectedProd(p); setProductQ(''); setProducts([]); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>
                    {productImg(p) && <img src={productImg(p)} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />}
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
        <label style={{ fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 6 }}>Заголовок *</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Заголовок новости"
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, outline: 'none', marginBottom: 20, boxSizing: 'border-box' }}
        />

        {/* Message */}
        <label style={{ fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 6 }}>Сообщение <span style={{ color: '#bbb', fontWeight: 400 }}>(необязательно)</span></label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Подробности, инструкции, комментарии..."
          rows={3}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, outline: 'none', marginBottom: 20, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
        />

        {/* Recipients */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#666' }}>
            Получатели <span style={{ color: '#bbb', fontWeight: 400 }}>({selected.size} из {users.length})</span>
          </label>
          <button onClick={toggleAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#3463A3', fontWeight: 600, padding: 0 }}>
            {selected.size === users.length ? 'Снять все' : 'Выбрать все'}
          </button>
        </div>
        {!usersLoaded ? (
          <div style={{ padding: '12px 0', fontSize: 12, color: '#aaa' }}>Загрузка...</div>
        ) : (
          <div style={{ border: '1.5px solid #e0e0e0', borderRadius: 8, maxHeight: 200, overflowY: 'auto', marginBottom: 20 }}>
            {users.map((u, i) => (
              <label key={u._id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer',
                borderBottom: i < users.length - 1 ? '1px solid #f4f4f4' : 'none',
                background: selected.has(u._id) ? '#f7fbff' : '#fff',
                transition: 'background .1s',
              }}>
                <input type="checkbox" checked={selected.has(u._id)} onChange={() => toggleUser(u._id)}
                  style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{u.email}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, background: '#f0f0f0', color: '#777', padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
              </label>
            ))}
          </div>
        )}

        {error && <div style={{ fontSize: 13, color: '#c0392b', marginBottom: 4, background: '#fdf0ef', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
      </div>{/* end scroll area */}

      {/* Sticky footer */}
      <div style={{ padding: '14px 28px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#fff', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1.5px solid #e0e0e0', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#555' }}>
            Отмена
          </button>
          <button onClick={submit} disabled={saving} style={{
            padding: '10px 24px', borderRadius: 8, border: 'none', background: saving ? '#aaa' : '#111',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? 'Отправка...' : `Опубликовать (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── News card ────────────────────────────────────────────────────────────────

function NewsCard({ item, onRead, onDelete, canDelete }) {
  const meta = TYPE_META[item.type] || TYPE_META.custom;
  const img  = productImg(item.product);

  const handleRead = () => {
    if (!item.read) onRead(item._id);
  };

  return (
    <div onClick={handleRead} style={{
      background: '#fff', borderRadius: 12, padding: '18px 20px',
      boxShadow: item.read ? '0 1px 4px rgba(0,0,0,.06)' : '0 2px 12px rgba(0,0,0,.1)',
      border: item.read ? '1.5px solid #f0f0f0' : `1.5px solid ${meta.color}40`,
      cursor: item.read ? 'default' : 'pointer',
      transition: 'box-shadow .2s, border-color .2s',
      position: 'relative',
      opacity: item.read ? .85 : 1,
    }}>
      {/* Unread dot */}
      {!item.read && (
        <div style={{ position: 'absolute', top: 18, right: 18, width: 9, height: 9, borderRadius: '50%', background: meta.color }} />
      )}

      {/* Type badge + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 11, color: '#bbb' }}>{timeAgo(item.createdAt)}</span>
        {item.createdBy?.name && <span style={{ fontSize: 11, color: '#ccc' }}>· {item.createdBy.name}</span>}
      </div>

      {/* Title */}
      <div style={{ fontWeight: 800, fontSize: 15, color: '#111', marginBottom: 8, paddingRight: 20 }}>
        {item.title}
      </div>

      {/* Product block */}
      {item.product?.name && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f7f8fa', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
          {img && <img src={img} alt="" style={{ width: 52, height: 52, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.product.name}
            </div>
            <div style={{ fontSize: 12, color: '#7d96a0', marginTop: 2 }}>
              Остаток на складе: <b style={{ color: item.product.stock === 0 ? '#c0392b' : '#111' }}>{item.product.stock ?? '—'} шт.</b>
            </div>
          </div>
        </div>
      )}

      {/* Message */}
      {item.message && (
        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
          {item.message}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: '#ccc' }}>{fmt(item.createdAt)}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {!item.read && (
            <button onClick={e => { e.stopPropagation(); onRead(item._id); }} style={{
              background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '4px 10px',
              fontSize: 11, color: '#555', cursor: 'pointer', fontWeight: 600,
            }}>Прочитано ✓</button>
          )}
          {canDelete && (
            <button onClick={e => { e.stopPropagation(); onDelete(item._id); }} style={{
              background: 'none', border: '1px solid #fcc', borderRadius: 6, padding: '4px 10px',
              fontSize: 11, color: '#c0392b', cursor: 'pointer', fontWeight: 600,
            }}>Удалить</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminNews() {
  const { user } = useAuth();
  const [news,       setNews]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [pages,      setPages]      = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [unread,     setUnread]     = useState(0);

  const load = useCallback((p = 1) => {
    setLoading(true);
    adminGetNews({ page: p, limit: 30 })
      .then(r => {
        setNews(r.data.news || []);
        setTotal(r.data.total || 0);
        setPages(r.data.pages || 1);
        setPage(p);
        const unreadCount = (r.data.news || []).filter(n => !n.read).length;
        setUnread(unreadCount);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(1); }, [load]);

  const handleRead = (id) => {
    adminMarkNewsRead(id).catch(() => {});
    setNews(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  const handleReadAll = () => {
    adminMarkAllNewsRead().catch(() => {});
    setNews(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
  };

  const handleDelete = (id) => {
    if (!confirm('Удалить новость?')) return;
    adminDeleteNews(id).then(() => load(page)).catch(() => {});
  };

  const handleCreated = (item) => {
    setNews(prev => [{ ...item, read: false }, ...prev]);
    setTotal(t => t + 1);
  };

  const isEditor = canEdit(user?.role);

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 0 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Лента новостей</h1>
          {unread > 0 && (
            <span style={{ background: '#e10523', color: '#fff', fontSize: 12, fontWeight: 800, borderRadius: 12, padding: '2px 10px' }}>
              {unread} новых
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {unread > 0 && (
            <button onClick={handleReadAll} style={{
              padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e0e0e0',
              background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#555',
            }}>Прочитать все</button>
          )}
          {isEditor && (
            <button onClick={() => setShowCreate(true)} style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: '#111', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>+ Новость</button>
          )}
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div style={{ width: 28, height: 28, border: '3px solid #e0e0e0', borderTopColor: '#000', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : news.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#bbb' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Новостей пока нет</div>
          {isEditor && <div style={{ fontSize: 13, marginTop: 6 }}>Создайте первую новость кнопкой выше</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {news.map(item => (
            <NewsCard
              key={item._id}
              item={item}
              onRead={handleRead}
              onDelete={handleDelete}
              canDelete={isEditor}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 28 }}>
          {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => load(p)} style={{
              width: 34, height: 34, borderRadius: 8, border: '1.5px solid',
              borderColor: p === page ? '#111' : '#e0e0e0',
              background: p === page ? '#111' : '#fff',
              color: p === page ? '#fff' : '#555',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>{p}</button>
          ))}
        </div>
      )}

      {/* Total */}
      {total > 0 && (
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#ccc' }}>
          Всего {total} новостей
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  );
}
