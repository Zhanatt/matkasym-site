import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetNews, adminMarkNewsRead, adminMarkAllNewsRead, adminDeleteNews } from '../../api';
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

function productImg(p) {
  if (!p) return null;
  if (p.images?.[0]) return p.images[0];
  if (p.driveImages?.[0]) return `https://drive.google.com/uc?export=view&id=${p.driveImages[0]}`;
  return null;
}

function fmt(d) {
  return new Date(d).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
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

function NewsCard({ item, onRead, onDelete, canDelete }) {
  const meta = TYPE_META[item.type] || TYPE_META.custom;
  const img  = productImg(item.product);

  return (
    <div onClick={() => !item.read && onRead(item._id)} style={{
      background: '#fff', borderRadius: 12, padding: '18px 20px',
      boxShadow: item.read ? '0 1px 4px rgba(0,0,0,.06)' : '0 2px 12px rgba(0,0,0,.1)',
      border: item.read ? '1.5px solid #f0f0f0' : `1.5px solid ${meta.color}40`,
      cursor: item.read ? 'default' : 'pointer',
      transition: 'box-shadow .2s, border-color .2s',
      position: 'relative',
      opacity: item.read ? .85 : 1,
    }}>
      {!item.read && (
        <div style={{ position: 'absolute', top: 18, right: 18, width: 9, height: 9, borderRadius: '50%', background: meta.color }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 11, color: '#bbb' }}>{timeAgo(item.createdAt)}</span>
        {item.createdBy?.name && <span style={{ fontSize: 11, color: '#ccc' }}>· {item.createdBy.name}</span>}
      </div>

      <div style={{ fontWeight: 800, fontSize: 15, color: '#111', marginBottom: 8, paddingRight: 20 }}>
        {item.title}
      </div>

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

      {item.message && (
        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
          {item.message}
        </div>
      )}

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

export default function AdminNews() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [news,    setNews]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(1);
  const [loading, setLoading] = useState(true);
  const [unread,  setUnread]  = useState(0);

  const isEditor = ['owner', 'editor'].includes(user?.role);

  const load = useCallback((p = 1) => {
    setLoading(true);
    adminGetNews({ page: p, limit: 30 })
      .then(r => {
        setNews(r.data.news || []);
        setTotal(r.data.total || 0);
        setPages(r.data.pages || 1);
        setPage(p);
        setUnread((r.data.news || []).filter(n => !n.read).length);
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

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 0 60px' }}>
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
            <button onClick={() => navigate('/admin/news/create')} style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: '#111', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>+ Новость</button>
          )}
        </div>
      </div>

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
            <NewsCard key={item._id} item={item} onRead={handleRead} onDelete={handleDelete} canDelete={isEditor} />
          ))}
        </div>
      )}

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

      {total > 0 && (
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#ccc' }}>
          Всего {total} новостей
        </div>
      )}
    </div>
  );
}
