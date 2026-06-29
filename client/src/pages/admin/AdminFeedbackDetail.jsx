import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { adminGetFeedback, adminUpdateFeedback } from '../../api';
import { cloudinaryOpt } from '../../utils/drive';

const TYPE_LABELS = {
  complaint:  { label: 'Жалоба',      color: '#d32f2f', bg: '#ffebee', icon: '😠' },
  suggestion: { label: 'Предложение', color: '#1976d2', bg: '#e3f2fd', icon: '💡' },
  defect:     { label: 'Дефект',      color: '#f57c00', bg: '#fff3e0', icon: '🔧' },
  question:   { label: 'Вопрос',      color: '#7b1fa2', bg: '#f3e5f5', icon: '❓' },
};

const PRIORITY_LABELS = {
  low:    { label: 'Низкий',   color: '#666' },
  medium: { label: 'Средний',  color: '#f57c00' },
  high:   { label: 'Высокий',  color: '#d32f2f' },
};

const STATUS_LABELS = {
  new:         { label: 'Новая',     color: '#1976d2', bg: '#e3f2fd' },
  in_progress: { label: 'В работе',  color: '#f57c00', bg: '#fff3e0' },
  resolved:    { label: 'Решена',    color: '#388e3c', bg: '#e8f5e9' },
  rejected:    { label: 'Отклонена', color: '#666', bg: '#f5f5f5' },
};

export default function AdminFeedbackDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [resolutionDesc, setResolutionDesc] = useState('');
  const [resolutionMedia, setResolutionMedia] = useState([]);
  const [showResolve, setShowResolve] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await adminGetFeedback(id);
      setFeedback(res.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleStatusChange = async (newStatus) => {
    setSaving(true);
    try {
      await adminUpdateFeedback(id, { status: newStatus });
      load();
    } catch (e) {
      alert('Ошибка');
    }
    setSaving(false);
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await adminUpdateFeedback(id, { comment: comment.trim() });
      setComment('');
      load();
    } catch (e) {
      alert('Ошибка');
    }
    setSaving(false);
  };

  const handleResolve = async () => {
    if (!resolutionDesc.trim()) {
      alert('Опишите решение');
      return;
    }
    setSaving(true);
    try {
      await adminUpdateFeedback(id, {
        status: 'resolved',
        resolution: {
          description: resolutionDesc,
          media: resolutionMedia
        }
      });
      setShowResolve(false);
      load();
    } catch (e) {
      alert('Ошибка');
    }
    setSaving(false);
  };

  const handleMediaUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setSaving(true);
    const urls = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'matkasym_unsigned');

      try {
        const res = await fetch('https://api.cloudinary.com/v1_1/dnbg21ef8/auto/upload', {
          method: 'POST', body: formData
        });
        const data = await res.json();
        if (data.secure_url) urls.push(data.secure_url);
      } catch (e) {
        console.error('Upload error:', e);
      }
    }

    setResolutionMedia(prev => [...prev, ...urls]);
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>Загрузка...</div>;
  if (!feedback) return <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>Заявка не найдена</div>;

  const type = TYPE_LABELS[feedback.type] || TYPE_LABELS.question;
  const priority = PRIORITY_LABELS[feedback.priority] || PRIORITY_LABELS.medium;
  const status = STATUS_LABELS[feedback.status] || STATUS_LABELS.new;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* Back link */}
      <Link to="/admin/feedback" style={{ color: '#1976d2', fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
        ← Все заявки
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <span style={{ background: type.bg, color: type.color, padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
              {type.icon} {type.label}
            </span>
            <span style={{ background: '#f5f5f5', color: priority.color, padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
              {priority.label} приоритет
            </span>
            <span style={{ background: status.bg, color: status.color, padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
              {status.label}
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
            {feedback.product?.name || 'Товар'}
          </h1>
          <p style={{ color: '#666', margin: '4px 0 0', fontSize: 14 }}>
            SKU: {feedback.product?.sku || '—'} · Создана {new Date(feedback.createdAt).toLocaleString('ru')}
          </p>
        </div>

        {/* Status actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {feedback.status === 'new' && (
            <button onClick={() => handleStatusChange('in_progress')} disabled={saving}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#f57c00', color: '#fff', fontWeight: 600, fontSize: 14 }}>
              Взять в работу
            </button>
          )}
          {feedback.status === 'in_progress' && (
            <>
              <button onClick={() => setShowResolve(true)} disabled={saving}
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#388e3c', color: '#fff', fontWeight: 600, fontSize: 14 }}>
                ✓ Решить
              </button>
              <button onClick={() => handleStatusChange('rejected')} disabled={saving}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1.5px solid #e0e0e0', cursor: 'pointer', background: '#fff', color: '#666', fontWeight: 600, fontSize: 14 }}>
                Отклонить
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        {/* Main content */}
        <div>
          {/* Product */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #e0e0e0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#666', marginBottom: 12, textTransform: 'uppercase' }}>Товар</h3>
            <Link to={`/admin/products/${feedback.product?._id}`} style={{ display: 'flex', gap: 16, textDecoration: 'none', color: 'inherit' }}>
              {feedback.product?.images?.[0] && (
                <img src={cloudinaryOpt(feedback.product.images[0], 200)} alt=""
                  style={{ width: 100, height: 100, borderRadius: 8, objectFit: 'cover' }} />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{feedback.product?.fullName || feedback.product?.name}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>SKU: {feedback.product?.sku}</div>
              </div>
            </Link>
          </div>

          {/* Problem */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #e0e0e0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#666', marginBottom: 12, textTransform: 'uppercase' }}>Проблема</h3>
            <p style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{feedback.problem?.description}</p>
            {feedback.problem?.media?.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {feedback.problem.media.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={cloudinaryOpt(url, 200)} alt=""
                      style={{ width: 120, height: 120, borderRadius: 8, objectFit: 'cover' }} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Alternatives */}
          {feedback.alternatives?.description && (
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #e0e0e0' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#666', marginBottom: 12, textTransform: 'uppercase' }}>Предложение от фронтмена</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{feedback.alternatives.description}</p>
              {feedback.alternatives?.media?.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  {feedback.alternatives.media.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={cloudinaryOpt(url, 200)} alt=""
                        style={{ width: 120, height: 120, borderRadius: 8, objectFit: 'cover' }} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resolution */}
          {feedback.resolution?.description && (
            <div style={{ background: '#e8f5e9', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #c8e6c9' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#388e3c', marginBottom: 12, textTransform: 'uppercase' }}>✓ Решение</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{feedback.resolution.description}</p>
              {feedback.resolution?.media?.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  {feedback.resolution.media.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={cloudinaryOpt(url, 200)} alt=""
                        style={{ width: 120, height: 120, borderRadius: 8, objectFit: 'cover' }} />
                    </a>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 12, color: '#666', marginTop: 12 }}>
                Решено {new Date(feedback.resolution.resolvedAt).toLocaleString('ru')}
                {feedback.resolution.resolvedBy && ` · ${feedback.resolution.resolvedBy.name}`}
              </p>
            </div>
          )}

          {/* Comments */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e0e0e0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#666', marginBottom: 16, textTransform: 'uppercase' }}>Комментарии</h3>

            {feedback.comments?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {feedback.comments.map((c, i) => (
                  <div key={i} style={{ background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                      {c.authorName || 'Пользователь'} · {new Date(c.createdAt).toLocaleString('ru')}
                    </div>
                    <div style={{ fontSize: 14 }}>{c.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#999', fontSize: 14, marginBottom: 16 }}>Пока нет комментариев</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Написать комментарий..."
                onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14 }}
              />
              <button onClick={handleAddComment} disabled={saving || !comment.trim()}
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#1976d2', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                Отправить
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e0e0e0', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#666', marginBottom: 16, textTransform: 'uppercase' }}>Фронтмен</h3>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{feedback.frontman?.name}</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{feedback.frontman?.phone}</div>
            <div style={{ fontSize: 13, color: '#666' }}>{feedback.frontman?.channel}</div>
          </div>

          {/* Status history */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e0e0e0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#666', marginBottom: 16, textTransform: 'uppercase' }}>История</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {feedback.statusHistory?.map((h, i) => (
                <div key={i} style={{ fontSize: 13, color: '#666' }}>
                  <span style={{ fontWeight: 600 }}>{STATUS_LABELS[h.to]?.label || h.to}</span>
                  <span style={{ marginLeft: 8 }}>{new Date(h.changedAt).toLocaleString('ru')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Resolve modal */}
      {showResolve && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setShowResolve(false)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24, maxWidth: 500, width: '90%'
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Решить заявку</h2>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6 }}>Описание решения *</span>
              <textarea
                value={resolutionDesc}
                onChange={e => setResolutionDesc(e.target.value)}
                placeholder="Что было сделано для решения проблемы..."
                rows={4}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 15, resize: 'vertical', boxSizing: 'border-box' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6 }}>Фото "после"</span>
              <input type="file" accept="image/*" multiple onChange={handleMediaUpload} style={{ display: 'none' }} id="resolution-media" />
              <label htmlFor="resolution-media" style={{
                display: 'inline-block', padding: '10px 20px', background: '#f5f5f5',
                borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500
              }}>
                📎 Прикрепить фото
              </label>
              {resolutionMedia.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {resolutionMedia.map((url, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={cloudinaryOpt(url, 120)} alt="" style={{ width: 60, height: 60, borderRadius: 6, objectFit: 'cover' }} />
                      <button onClick={() => setResolutionMedia(prev => prev.filter((_, j) => j !== i))}
                        style={{
                          position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                          borderRadius: '50%', background: '#d32f2f', color: '#fff', border: 'none',
                          cursor: 'pointer', fontSize: 10, lineHeight: 1
                        }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </label>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowResolve(false)}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1.5px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                Отмена
              </button>
              <button onClick={handleResolve} disabled={saving || !resolutionDesc.trim()}
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#388e3c', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                {saving ? 'Сохранение...' : '✓ Решить заявку'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
