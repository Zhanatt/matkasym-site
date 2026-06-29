import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminGetFeedbacks, adminUpdateFeedback } from '../../api';
import { cloudinaryOpt } from '../../utils/drive';

const TYPE_LABELS = {
  complaint:  { label: 'Жалоба',      color: '#d32f2f', bg: '#ffebee' },
  suggestion: { label: 'Предложение', color: '#1976d2', bg: '#e3f2fd' },
  defect:     { label: 'Дефект',      color: '#f57c00', bg: '#fff3e0' },
  question:   { label: 'Вопрос',      color: '#7b1fa2', bg: '#f3e5f5' },
};

const PRIORITY_LABELS = {
  low:    { label: 'Низкий',   color: '#666', bg: '#f5f5f5' },
  medium: { label: 'Средний',  color: '#f57c00', bg: '#fff3e0' },
  high:   { label: 'Высокий',  color: '#d32f2f', bg: '#ffebee' },
};

const STATUS_LABELS = {
  new:         { label: 'Новая',     color: '#1976d2', bg: '#e3f2fd' },
  in_progress: { label: 'В работе',  color: '#f57c00', bg: '#fff3e0' },
  resolved:    { label: 'Решена',    color: '#388e3c', bg: '#e8f5e9' },
  rejected:    { label: 'Отклонена', color: '#666', bg: '#f5f5f5' },
};

export default function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: '' });
  const [stats, setStats] = useState({ newCount: 0, inProgressCount: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminGetFeedbacks(filter.status ? { status: filter.status } : {});
      setFeedbacks(res.data.feedbacks || []);
      setStats({ newCount: res.data.newCount || 0 });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter.status]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await adminUpdateFeedback(id, { status: newStatus });
      load();
    } catch (e) {
      alert('Ошибка при обновлении статуса');
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            Обратная связь
            {stats.newCount > 0 && (
              <span style={{
                background: '#d32f2f', color: '#fff', fontSize: 14, fontWeight: 700,
                padding: '4px 10px', borderRadius: 12
              }}>
                {stats.newCount} новых
              </span>
            )}
          </h1>
          <p style={{ color: '#666', margin: '4px 0 0', fontSize: 14 }}>
            Заявки от фронтменов
          </p>
        </div>

        <Link to="/admin/feedback/new" style={{
          background: '#1976d2', color: '#fff', padding: '10px 20px', borderRadius: 8,
          textDecoration: 'none', fontWeight: 600, fontSize: 14
        }}>
          + Новая заявка
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[{ key: '', label: 'Все' }, ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ key: k, label: v.label }))].map(s => (
          <button key={s.key} onClick={() => setFilter({ status: s.key })} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: filter.status === s.key ? '#1976d2' : '#f0f0f0',
            color: filter.status === s.key ? '#fff' : '#333',
            fontWeight: 600, fontSize: 13
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Загрузка...</div>
      ) : feedbacks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Нет заявок</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {feedbacks.map(fb => {
            const type = TYPE_LABELS[fb.type] || TYPE_LABELS.question;
            const priority = PRIORITY_LABELS[fb.priority] || PRIORITY_LABELS.medium;
            const status = STATUS_LABELS[fb.status] || STATUS_LABELS.new;
            const productImg = fb.product?.images?.[0];

            return (
              <Link to={`/admin/feedback/${fb._id}`} key={fb._id} style={{
                display: 'flex', gap: 16, padding: 16, background: '#fff', borderRadius: 12,
                border: '1px solid #e0e0e0', textDecoration: 'none', color: 'inherit',
                transition: 'box-shadow 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                {/* Product image */}
                <div style={{
                  width: 80, height: 80, borderRadius: 8, overflow: 'hidden',
                  background: '#f5f5f5', flexShrink: 0
                }}>
                  {productImg ? (
                    <img src={cloudinaryOpt(productImg, 160)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
                      📦
                    </div>
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      background: type.bg, color: type.color, padding: '3px 8px',
                      borderRadius: 4, fontSize: 11, fontWeight: 600
                    }}>{type.label}</span>
                    <span style={{
                      background: priority.bg, color: priority.color, padding: '3px 8px',
                      borderRadius: 4, fontSize: 11, fontWeight: 600
                    }}>{priority.label}</span>
                    <span style={{
                      background: status.bg, color: status.color, padding: '3px 8px',
                      borderRadius: 4, fontSize: 11, fontWeight: 600
                    }}>{status.label}</span>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: '#333' }}>
                    {fb.product?.name || 'Товар'}
                  </div>

                  <div style={{
                    fontSize: 13, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', maxWidth: 500
                  }}>
                    {fb.problem?.description || ''}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, fontSize: 12, color: '#999' }}>
                    <span>👤 {fb.frontman?.name || 'Фронтмен'}</span>
                    <span>📅 {new Date(fb.createdAt).toLocaleDateString('ru')}</span>
                    {fb.problem?.media?.length > 0 && <span>📎 {fb.problem.media.length}</span>}
                  </div>
                </div>

                {/* Quick actions */}
                {fb.status === 'new' && (
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); handleStatusChange(fb._id, 'in_progress'); }}
                    style={{
                      padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: '#f57c00', color: '#fff', fontWeight: 600, fontSize: 12,
                      alignSelf: 'center', whiteSpace: 'nowrap'
                    }}
                  >
                    Взять в работу
                  </button>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
