import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socialGetPublications, socialRetryPublication, socialDeletePublication } from '../../api';
import { cloudinaryOpt } from '../../utils/drive';
import { platformMeta } from '../../config/socialPlatforms';

const STATUS = {
  published: { label: 'опубликовано', color: '#1e7c3a', icon: '✅' },
  failed:    { label: 'ошибка',       color: '#c0392b', icon: '❌' },
  pending:   { label: 'ожидает',      color: '#8a6d00', icon: '🕓' },
  publishing:{ label: 'отправляется', color: '#8a6d00', icon: '⏳' },
  skipped:   { label: 'пропущено',    color: '#888',    icon: '–' },
};

export default function AdminPublishHistory() {
  const navigate = useNavigate();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState('');

  const load = () => {
    setLoading(true);
    socialGetPublications(50)
      .then(r => setItems(r.data.publications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const retry = async (id) => {
    setBusy(id);
    try { await socialRetryPublication(id); load(); } catch { /* ошибка видна в статусах после перезагрузки */ }
    setBusy('');
  };

  const remove = async (id) => {
    if (!confirm('Удалить запись из журнала? На площадках пост останется.')) return;
    await socialDeletePublication(id);
    load();
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 0 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/admin/publish')} style={{
          background: 'none', border: '1.5px solid #e0e0e0', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#555', fontWeight: 600,
        }}>← К публикации</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📜 Журнал публикаций</h1>
        <button onClick={load} style={{
          marginLeft: 'auto', padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0',
          background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#555',
        }}>Обновить</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: '#aaa' }}>Загрузка...</div>
      ) : !items.length ? (
        <div style={{ background: '#fff', borderRadius: 14, padding: 30, textAlign: 'center', color: '#999', fontSize: 13 }}>
          Публикаций пока не было.
        </div>
      ) : items.map(p => {
        const failed = (p.targets || []).filter(t => t.status === 'failed').length;
        return (
          <div key={p._id} style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.07)', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {p.images?.[0] && (
                <img src={cloudinaryOpt(p.images[0], 200)} alt="" style={{ width: 62, height: 62, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>
                  {p.productName || (p.kind === 'custom' ? 'Свободный пост' : 'Публикация')}
                </div>
                <div style={{ fontSize: 11, color: '#8b98a5', marginTop: 3 }}>
                  {new Date(p.createdAt).toLocaleString('ru')}
                  {p.createdBy?.name && ` · ${p.createdBy.name}`}
                  {p.scheduledAt && ` · отложено на ${new Date(p.scheduledAt).toLocaleString('ru')}`}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
                  {String(p.text || '').replace(/<\/?[bi]>/g, '').slice(0, 200)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {failed > 0 && (
                  <button onClick={() => retry(p._id)} disabled={busy === p._id} style={{
                    padding: '7px 14px', borderRadius: 8, border: 'none', background: '#111', color: '#fff',
                    fontSize: 12, fontWeight: 700, cursor: busy === p._id ? 'wait' : 'pointer',
                  }}>{busy === p._id ? '...' : `↻ Повторить (${failed})`}</button>
                )}
                <button onClick={() => remove(p._id)} style={{
                  padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0',
                  background: '#fff', color: '#c0392b', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>Удалить</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid #f0f1f3' }}>
              {(p.targets || []).map((t, i) => {
                const meta = platformMeta(t.platform);
                const st   = STATUS[t.status] || STATUS.pending;
                return (
                  <div key={i} title={t.error || ''} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px',
                    borderRadius: 8, background: '#f7f8fa', fontSize: 11,
                  }}>
                    <span>{meta.icon}</span>
                    <b style={{ color: '#111' }}>{t.title}</b>
                    {t.postType === 'story' && <span style={{ color: '#8b98a5' }}>история</span>}
                    <span style={{ color: st.color, fontWeight: 700 }}>{st.icon} {st.label}</span>
                    {t.externalUrl && <a href={t.externalUrl} target="_blank" rel="noreferrer" style={{ color: '#3463A3' }}>↗</a>}
                  </div>
                );
              })}
            </div>

            {(p.targets || []).some(t => t.error) && (
              <div style={{ marginTop: 10, fontSize: 11, color: '#c0392b' }}>
                {(p.targets || []).filter(t => t.error).map((t, i) => (
                  <div key={i}>{t.title}: {t.error}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
