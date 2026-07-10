import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminGetTechRequest, adminUpdateTechRequest, adminDeleteTechRequest } from '../../api';
import { PRIORITIES, STATUS_LABELS, legalStatus, symbolType } from '../../config/techRequest';

const STATUS_COLORS = {
  new:         { color: '#1976d2', bg: '#e3f2fd' },
  in_progress: { color: '#f57c00', bg: '#fff3e0' },
  review:      { color: '#9c27b0', bg: '#f3e5f5' },
  done:        { color: '#388e3c', bg: '#e8f5e9' },
  rejected:    { color: '#d32f2f', bg: '#ffebee' },
};

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid #f5f5f5' }}>
      <div style={{ width: 160, flexShrink: 0, fontSize: 12, color: '#888', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#111', fontWeight: 500 }}>{value || '—'}</div>
    </div>
  );
}

function Card({ title, icon, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 20, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

export default function AdminTechRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminGetTechRequest(id);
      setReq(res.data);
    } catch {
      setReq(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const patch = async (body) => {
    setBusy(true);
    try {
      const res = await adminUpdateTechRequest(id, body);
      setReq(res.data);
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка при обновлении');
    }
    setBusy(false);
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    await patch({ comment: comment.trim() });
    setComment('');
  };

  const reject = async () => {
    const reason = prompt('Причина отклонения заявки:');
    if (reason === null) return;
    await patch({ status: 'rejected', rejectReason: reason });
  };

  const remove = async () => {
    if (!confirm('Удалить заявку безвозвратно?')) return;
    try {
      await adminDeleteTechRequest(id);
      navigate('/admin/tech-requests');
    } catch (e) {
      alert(e.response?.data?.error || 'Не удалось удалить заявку');
    }
  };

  if (loading) return <div style={{ padding: 80, textAlign: 'center', color: '#aaa' }}>Загрузка...</div>;
  if (!req) return <div style={{ padding: 80, textAlign: 'center', color: '#aaa' }}>Заявка не найдена</div>;

  const st = STATUS_COLORS[req.status] || STATUS_COLORS.new;
  const priority = PRIORITIES[req.priority] || PRIORITIES.medium;
  const client = req.client || {};
  const item = req.item || {};

  return (
    <div style={{ padding: '20px 0', maxWidth: 780 }}>
      <button onClick={() => navigate('/admin/tech-requests')} style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        ← К доске
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>ТЗ-{req.number}</h1>
        <span style={{ background: st.bg, color: st.color, padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
          {STATUS_LABELS[req.status]}
        </span>
        <span style={{ background: priority.bg, color: priority.color, padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
          {priority.label} приоритет
        </span>
      </div>
      <p style={{ color: '#888', margin: '0 0 20px', fontSize: 13 }}>
        Создал {req.createdBy?.name || '—'} · {formatDateTime(req.createdAt)}
      </p>

      <Card title="Клиент" icon="👤">
        <Row label="Имя" value={client.name} />
        <Row label="Юр. статус" value={legalStatus(client.legalStatus).label} />
        <Row label="Компания" value={client.companyName} />
        <Row label="Телефон" value={client.phone} />
      </Card>

      <Card title="Изделие" icon="📦">
        <Row label="Наименование" value={item.name} />
        <Row label="Размеры" value={item.dimensions} />
        <Row label="Цвет" value={item.color} />
        <Row label="Количество" value={`${item.quantity || 1} шт.`} />
      </Card>

      <Card title="Символика" icon="🏷">
        {req.symbols?.has ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {(req.symbols.types || []).map(t => (
                <span key={t} style={{ background: '#ede7f6', color: '#5e35b1', padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                  {symbolType(t).icon} {symbolType(t).label}
                </span>
              ))}
            </div>
            {req.symbols.description && (
              <div style={{ fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{req.symbols.description}</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 14, color: '#888' }}>Символики нет</div>
        )}
      </Card>

      <Card title="Техническое задание" icon="📝">
        <div style={{ fontSize: 14, color: '#222', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{req.spec?.description}</div>
        {req.spec?.media?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {req.spec.media.map(url => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
              </a>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f5f5f5' }}>
          <Row label="Срок" value={req.deadline ? formatDateTime(req.deadline) : ''} />
          <Row label="Конструктор" value={req.assignedTo?.name} />
        </div>
      </Card>

      {req.result?.description && (
        <Card title="Результат" icon="✅">
          <div style={{ fontSize: 14, color: '#222', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{req.result.description}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 10 }}>
            {req.result.doneBy?.name || '—'} · {formatDateTime(req.result.doneAt)}
          </div>
        </Card>
      )}

      {req.status === 'rejected' && req.rejectReason && (
        <Card title="Причина отклонения" icon="🚫">
          <div style={{ fontSize: 14, color: '#c62828', whiteSpace: 'pre-wrap' }}>{req.rejectReason}</div>
        </Card>
      )}

      <Card title={`Комментарии (${req.comments?.length || 0})`} icon="💬">
        {(req.comments || []).map((c, i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>
              {c.author?.name || c.authorName || 'Пользователь'}
              <span style={{ fontWeight: 400, color: '#aaa', marginLeft: 8 }}>{formatDateTime(c.createdAt)}</span>
            </div>
            <div style={{ fontSize: 14, color: '#222', marginTop: 4, whiteSpace: 'pre-wrap' }}>{c.text}</div>
          </div>
        ))}
        {!req.comments?.length && <div style={{ fontSize: 13, color: '#aaa', marginBottom: 12 }}>Пока нет комментариев</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addComment()}
            placeholder="Написать комментарий..."
            style={{ flex: 1, padding: '11px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, boxSizing: 'border-box' }}
          />
          <button onClick={addComment} disabled={busy || !comment.trim()} style={{ padding: '0 20px', borderRadius: 8, border: 'none', background: comment.trim() ? '#1976d2' : '#e0e0e0', color: comment.trim() ? '#fff' : '#999', fontSize: 13, fontWeight: 700, cursor: comment.trim() ? 'pointer' : 'not-allowed' }}>
            Отправить
          </button>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 10, paddingBottom: 40, flexWrap: 'wrap' }}>
        {req.status !== 'rejected' && req.status !== 'done' && (
          <button onClick={reject} disabled={busy} style={{ padding: '12px 24px', borderRadius: 8, border: '1.5px solid #ffcdd2', background: '#fff', color: '#d32f2f', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            🚫 Отклонить
          </button>
        )}
        {req.status === 'rejected' && (
          <button onClick={() => patch({ status: 'new' })} disabled={busy} style={{ padding: '12px 24px', borderRadius: 8, border: '1.5px solid #bbdefb', background: '#fff', color: '#1976d2', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ↩︎ Вернуть в работу
          </button>
        )}
        <button onClick={remove} disabled={busy} style={{ padding: '12px 24px', borderRadius: 8, border: 'none', background: '#fafafa', color: '#999', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Удалить
        </button>
      </div>
    </div>
  );
}
