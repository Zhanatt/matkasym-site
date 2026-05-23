import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetNews, adminMarkNewsRead, adminMarkAllNewsRead, adminDeleteNews, adminSyncNewsProduct } from '../../api';
import { useAuth } from '../../context/AuthContext';

// Типы, которые автоматически синхронизируют статус товара
const SYNC_TYPES = new Set(['discontinued', 'nelikvid', 'out_of_stock', 'restocked']);

const TYPE_META = {
  discontinued:          { label: 'Снят с производства', color: '#e10523', bg: '#fff0ef' },
  nelikvid:              { label: 'Неликвид',             color: '#8e44ad', bg: '#f5eef8' },
  out_of_stock:          { label: 'Нет в наличии',         color: '#7f8c8d', bg: '#f2f3f4' },
  restocked:             { label: 'Появился на складе',    color: '#27ae60', bg: '#eafaf1' },
  price_change:          { label: 'Изменение цены',        color: '#2980b9', bg: '#eaf4fb' },
  custom:                { label: 'Объявление',            color: '#2c3e50', bg: '#f0f3f4' },
  new_product:           { label: 'Новый товар',           color: '#27ae60', bg: '#eafaf1' },
  status_planned:        { label: 'В планах',              color: '#f39c12', bg: '#fef9e7' },
  status_in_development: { label: 'В разработке',          color: '#3498db', bg: '#ebf5fb' },
  status_improvement:    { label: 'На улучшении',          color: '#9b59b6', bg: '#f5eef8' },
  status_for_sale:       { label: 'В продаже',             color: '#27ae60', bg: '#eafaf1' },
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

const IconBox = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e10523" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>
  </svg>
);

const IconChat = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e10523" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
  </svg>
);

const IconTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

const IconSync = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15"/>
  </svg>
);

const IconEye = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3498db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

function NewsCard({ item, onRead, onDelete, onSync, canDelete }) {
  const [showViewers, setShowViewers] = useState(false);
  const meta = TYPE_META[item.type] || TYPE_META.custom;
  const img  = productImg(item.product);

  const viewers = (item.recipients || []).filter(r => r.read);
  const viewCount = viewers.length;
  const totalRecipients = (item.recipients || []).length;

  return (
    <div
      onClick={() => !item.read && onRead(item._id)}
      style={{
        background: '#fff',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: item.read ? '0 2px 12px rgba(0,0,0,.06)' : '0 4px 24px rgba(0,0,0,.1)',
        border: item.read ? '1.5px solid #f0f0f0' : `1.5px solid ${meta.color}30`,
        cursor: item.read ? 'default' : 'pointer',
        transition: 'box-shadow .2s',
        position: 'relative',
      }}
    >
      {/* Unread accent line */}
      {!item.read && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: meta.color, borderRadius: '20px 0 0 20px' }} />
      )}

      <div style={{ padding: '20px 22px 0' }}>
        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{
            background: meta.bg, color: meta.color,
            fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 20,
          }}>{meta.label}</span>
          <span style={{ fontSize: 12, color: '#bbb' }}>{timeAgo(item.createdAt)}</span>
          {item.createdBy?.name && <>
            <span style={{ color: '#ddd' }}>•</span>
            <span style={{ fontSize: 12, color: '#bbb' }}>{item.createdBy.name}</span>
          </>}
          <span style={{ color: '#ddd' }}>•</span>
          <span style={{ fontSize: 12, color: '#bbb' }}>{fmt(item.createdAt)}</span>
        </div>

        {/* Title */}
        <div style={{ fontSize: 20, fontWeight: 800, color: '#111', lineHeight: 1.35, marginBottom: 18 }}>
          {item.title}
        </div>
      </div>

      {/* Large image */}
      {img && (
        <div style={{ margin: '0 22px 18px', background: '#f7f8fa', borderRadius: 14, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <img
            src={img}
            alt=""
            style={{ width: '100%', maxHeight: 340, objectFit: 'contain', display: 'block', padding: '16px 0' }}
          />
        </div>
      )}

      <div style={{ padding: '0 22px' }}>
        {/* Product info */}
        {item.product?.name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff0ef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <IconBox />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{item.product.name}</div>
              <div style={{ fontSize: 13, color: '#777', marginTop: 2 }}>
                Остаток на складе:{' '}
                <b style={{ color: item.product.stock === 0 ? '#e10523' : '#111', fontWeight: 800 }}>
                  {item.product.stock ?? '—'} шт.
                </b>
              </div>
            </div>
          </div>
        )}

        {/* Message */}
        {item.message && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff0ef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <IconChat />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#bbb', fontWeight: 600, marginBottom: 3, letterSpacing: .3 }}>Комментарий</div>
              <div style={{ fontSize: 14, color: '#333', lineHeight: 1.5 }}>{item.message}</div>
            </div>
          </div>
        )}

        {/* Views */}
        {totalRecipients > 0 && (
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={e => { e.stopPropagation(); setShowViewers(!showViewers); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                background: '#f0f7ff', border: 'none', borderRadius: 10, padding: '10px 14px',
                cursor: 'pointer', transition: 'background .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#e3f0fc'}
              onMouseLeave={e => e.currentTarget.style.background = '#f0f7ff'}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e3f0fc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconEye />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2980b9' }}>
                  Просмотрено: {viewCount} из {totalRecipients}
                </div>
                <div style={{ fontSize: 11, color: '#7fb3de', marginTop: 1 }}>
                  {showViewers ? 'Скрыть список' : 'Показать кто просмотрел'}
                </div>
              </div>
              <span style={{ fontSize: 14, color: '#2980b9', transform: showViewers ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }}>▼</span>
            </button>

            {showViewers && viewers.length > 0 && (
              <div style={{ marginTop: 8, background: '#fafcff', borderRadius: 8, border: '1px solid #e3f0fc', overflow: 'hidden' }}>
                {viewers.map((v, i) => (
                  <div key={v.userId || i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderBottom: i < viewers.length - 1 ? '1px solid #f0f5fa' : 'none',
                  }}>
                    <span style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>{v.name || v.email}</span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>{v.readAt ? fmt(v.readAt) : '—'}</span>
                  </div>
                ))}
              </div>
            )}

            {showViewers && viewers.length === 0 && (
              <div style={{ marginTop: 8, padding: '12px', background: '#fafcff', borderRadius: 8, border: '1px solid #e3f0fc', fontSize: 13, color: '#999', textAlign: 'center' }}>
                Ещё никто не просмотрел
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {canDelete && (
          <div style={{ paddingBottom: 20, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Sync button — only for types that affect product status */}
            {item.product?.id && SYNC_TYPES.has(item.type) && (
              <button
                onClick={e => { e.stopPropagation(); onSync(item._id); }}
                style={{
                  width: '100%', padding: '13px', borderRadius: 12,
                  border: '1.5px solid #2980b9', background: '#fff',
                  color: '#2980b9', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#eaf4fb'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <IconSync /> Применить статус к товару
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onDelete(item._id); }}
              style={{
                width: '100%', padding: '13px', borderRadius: 12,
                border: '1.5px solid #e10523', background: '#fff',
                color: '#e10523', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <IconTrash /> Удалить
            </button>
          </div>
        )}
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
    adminGetNews({ page: p, limit: 20 })
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

  const handleSync = (id) => {
    adminSyncNewsProduct(id)
      .then(() => alert('Статус товара обновлён'))
      .catch(e => alert(e.response?.data?.message || 'Ошибка синхронизации'));
  };

  return (
    <div style={{ position: 'relative', minHeight: '100%', overflow: 'hidden' }}>
      {/* Background blobs */}
      <div style={{ position: 'fixed', bottom: -80, left: 140, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(225,5,35,.12) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', top: 60, right: 0, width: 200, height: 300, borderRadius: '50% 0 0 50%', background: 'radial-gradient(circle, rgba(225,5,35,.1) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 600, margin: '0 auto', padding: '32px 0 60px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logos/logo-main.png" alt="MATKASYM" style={{ height: 32, marginBottom: 16, filter: 'invert(0)' }} />
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: -.5 }}>Лента новостей</h1>
        </div>

        {/* Actions */}
        {(isEditor || unread > 0) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 20 }}>
            {unread > 0 && (
              <button onClick={handleReadAll} style={{
                padding: '8px 16px', borderRadius: 10, border: '1.5px solid #e0e0e0',
                background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#555',
              }}>Прочитать все</button>
            )}
            {isEditor && (
              <button onClick={() => navigate('/admin/news/create')} style={{
                padding: '8px 20px', borderRadius: 10, border: 'none',
                background: '#111', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>+ Новость</button>
            )}
          </div>
        )}

        {/* Feed */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #e0e0e0', borderTopColor: '#e10523', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : news.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#bbb' }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📭</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#999' }}>Новостей пока нет</div>
            {isEditor && <div style={{ fontSize: 13, marginTop: 6 }}>Создайте первую новость кнопкой выше</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {news.map(item => (
              <NewsCard
                key={item._id}
                item={item}
                onRead={handleRead}
                onDelete={handleDelete}
                onSync={handleSync}
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

        {total > 0 && (
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#bbb' }}>
            Всего {total} новостей
          </div>
        )}
      </div>
    </div>
  );
}
