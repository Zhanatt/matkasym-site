import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminGetFeedbacks, adminUpdateFeedback, adminGetUsers } from '../../api';
import { cloudinaryOpt } from '../../utils/drive';

const TYPE_LABELS = {
  complaint:  { label: 'Жалоба',      color: '#d32f2f', bg: '#ffebee', icon: '😠' },
  suggestion: { label: 'Предложение', color: '#1976d2', bg: '#e3f2fd', icon: '💡' },
  defect:     { label: 'Дефект',      color: '#f57c00', bg: '#fff3e0', icon: '🔧' },
  question:   { label: 'Вопрос',      color: '#7b1fa2', bg: '#f3e5f5', icon: '❓' },
};

const PRIORITY_LABELS = {
  low:    { label: 'Низкий',   color: '#666', bg: '#f5f5f5' },
  medium: { label: 'Средний',  color: '#f57c00', bg: '#fff3e0' },
  high:   { label: 'Высокий',  color: '#d32f2f', bg: '#ffebee' },
};

const COLUMNS = [
  { key: 'new',         label: 'Новые',       color: '#1976d2', bg: '#e3f2fd', icon: '📥' },
  { key: 'in_progress', label: 'В работе',    color: '#f57c00', bg: '#fff3e0', icon: '⚡' },
  { key: 'improvement', label: 'На улучшении', color: '#9c27b0', bg: '#f3e5f5', icon: '🔧' },
  { key: 'resolved',    label: 'Решено',      color: '#388e3c', bg: '#e8f5e9', icon: '✅' },
];

function avatar(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
}

function daysLeft(deadline) {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  const diff = Math.ceil((dl - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function FeedbackCard({ fb, onMove, users, onAssign, onSetDeadline }) {
  const navigate = useNavigate();
  const type = TYPE_LABELS[fb.type] || TYPE_LABELS.question;
  const priority = PRIORITY_LABELS[fb.priority] || PRIORITY_LABELS.medium;
  const productImg = fb.product?.images?.[0];
  const days = daysLeft(fb.deadline);
  const isOverdue = days !== null && days < 0;
  const isUrgent = days !== null && days >= 0 && days <= 2;

  const [showAssign, setShowAssign] = useState(false);
  const [showDeadline, setShowDeadline] = useState(false);
  const [deadlineVal, setDeadlineVal] = useState(fb.deadline ? fb.deadline.split('T')[0] : '');

  const handleAssign = (userId) => {
    onAssign(fb._id, userId);
    setShowAssign(false);
  };

  const handleDeadline = () => {
    if (deadlineVal) {
      onSetDeadline(fb._id, deadlineVal);
    }
    setShowDeadline(false);
  };

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        border: isOverdue ? '2px solid #d32f2f' : isUrgent ? '2px solid #f57c00' : '1px solid rgba(0,0,0,0.06)',
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s',
        position: 'relative',
      }}
      onClick={() => navigate(`/admin/feedback/${fb._id}`)}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
    >
      {/* Header: Type + Priority */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ background: type.bg, color: type.color, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
          {type.icon} {type.label}
        </span>
        <span style={{ background: priority.bg, color: priority.color, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
          {priority.label}
        </span>
        {fb.problem?.media?.length > 0 && (
          <span style={{ fontSize: 10, color: '#888' }}>📎 {fb.problem.media.length}</span>
        )}
      </div>

      {/* Product */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', background: '#f5f5f5', flexShrink: 0 }}>
          {productImg ? (
            <img src={cloudinaryOpt(productImg, 96)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 20 }}>📦</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#111', lineHeight: 1.3, marginBottom: 2 }}>
            {fb.product?.name || 'Товар'}
          </div>
          <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fb.problem?.description?.slice(0, 60) || ''}...
          </div>
        </div>
      </div>

      {/* Meta: Frontman + Date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#888', marginBottom: 10, flexWrap: 'wrap' }}>
        <span>👤 {fb.frontman?.name || '—'}</span>
        <span>📅 {formatDate(fb.createdAt)}</span>
      </div>

      {/* Deadline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }} onClick={e => e.stopPropagation()}>
        {fb.deadline ? (
          <div
            onClick={() => setShowDeadline(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
              background: isOverdue ? '#ffebee' : isUrgent ? '#fff3e0' : '#f5f5f5',
              color: isOverdue ? '#d32f2f' : isUrgent ? '#f57c00' : '#666',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            🗓 {formatDate(fb.deadline)}
            {isOverdue && <span style={{ marginLeft: 4 }}>просрочено</span>}
            {isUrgent && !isOverdue && <span style={{ marginLeft: 4 }}>{days} дн.</span>}
          </div>
        ) : (
          <button
            onClick={() => setShowDeadline(true)}
            style={{ background: 'none', border: '1px dashed #ccc', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#888', cursor: 'pointer' }}
          >
            + Срок
          </button>
        )}

        {showDeadline && (
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
            <input type="date" value={deadlineVal} onChange={e => setDeadlineVal(e.target.value)} style={{ padding: 6, borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={handleDeadline} style={{ flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#1976d2', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>ОК</button>
              <button onClick={() => setShowDeadline(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 11, cursor: 'pointer' }}>✕</button>
            </div>
          </div>
        )}
      </div>

      {/* Assignee */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} onClick={e => e.stopPropagation()}>
        {fb.assignee ? (
          <div
            onClick={() => setShowAssign(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1976d2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
              {avatar(fb.assignee.name)}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#333' }}>{fb.assignee.name}</span>
          </div>
        ) : (
          <button
            onClick={() => setShowAssign(true)}
            style={{ background: 'none', border: '1px dashed #ccc', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#888', cursor: 'pointer' }}
          >
            + Ответственный
          </button>
        )}

        {showAssign && (
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 200, maxHeight: 220, overflowY: 'auto' }}>
            <div style={{ padding: '6px 10px', fontSize: 10, color: '#888', fontWeight: 600, borderBottom: '1px solid #f0f0f0' }}>ВЫБРАТЬ</div>
            {users.map(u => (
              <div key={u._id} onClick={() => handleAssign(u._id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #fafafa' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f8ff'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1976d2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                  {avatar(u.name)}
                </div>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{u.name}</span>
              </div>
            ))}
            {fb.assignee && (
              <div onClick={() => handleAssign(null)} style={{ padding: '8px 10px', cursor: 'pointer', color: '#d32f2f', fontSize: 11, fontWeight: 600, borderTop: '1px solid #f0f0f0' }}>
                Снять ответственного
              </div>
            )}
            <div onClick={() => setShowAssign(false)} style={{ padding: '6px 10px', cursor: 'pointer', color: '#888', fontSize: 11, textAlign: 'center', borderTop: '1px solid #f0f0f0' }}>
              Отмена
            </div>
          </div>
        )}
      </div>

      {/* Move buttons */}
      {fb.status !== 'resolved' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f0f0' }} onClick={e => e.stopPropagation()}>
          {fb.status === 'new' && (
            <button onClick={() => onMove(fb._id, 'in_progress')} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: '#fff3e0', color: '#f57c00', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ⚡ В работу
            </button>
          )}
          {fb.status === 'in_progress' && (
            <>
              <button onClick={() => onMove(fb._id, 'improvement')} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: '#f3e5f5', color: '#9c27b0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                🔧 На улучшение
              </button>
              <button onClick={() => onMove(fb._id, 'resolved')} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: '#e8f5e9', color: '#388e3c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                ✅ Решено
              </button>
            </>
          )}
          {fb.status === 'improvement' && (
            <button onClick={() => onMove(fb._id, 'resolved')} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: '#e8f5e9', color: '#388e3c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ✅ Решено
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ column, feedbacks, onMove, users, onAssign, onSetDeadline }) {
  return (
    <div style={{ flex: 1, minWidth: 300, maxWidth: 360 }}>
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 12px', background: column.bg, borderRadius: 10 }}>
        <span style={{ fontSize: 16 }}>{column.icon}</span>
        <span style={{ fontWeight: 800, fontSize: 14, color: column.color }}>{column.label}</span>
        <span style={{ marginLeft: 'auto', background: column.color, color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
          {feedbacks.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 200 }}>
        {feedbacks.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: '#ccc', fontSize: 12 }}>Пусто</div>
        )}
        {feedbacks.map(fb => (
          <FeedbackCard key={fb._id} fb={fb} onMove={onMove} users={users} onAssign={onAssign} onSetDeadline={onSetDeadline} />
        ))}
      </div>
    </div>
  );
}

export default function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('kanban');
  const [showRejected, setShowRejected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetFeedbacks({});
      const fbs = res.data.feedbacks || [];
      setFeedbacks(fbs.map(fb => ({
        ...fb,
        assignee: fb.assignedTo ? { _id: fb.assignedTo._id || fb.assignedTo, name: fb.assignedTo.name || '' } : null,
        deadline: fb.deadline || null,
      })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminGetUsers().then(r => {
      const admins = (r.data || []).filter(u => ['owner', 'editor', 'viewer'].includes(u.role));
      setUsers(admins);
    }).catch(() => {});
  }, []);

  const handleMove = async (id, newStatus) => {
    try {
      const updates = { status: newStatus };
      if (newStatus === 'in_progress') updates.startedAt = new Date().toISOString();
      await adminUpdateFeedback(id, updates);
      setFeedbacks(prev => prev.map(fb => fb._id === id ? { ...fb, status: newStatus, ...updates } : fb));
    } catch (e) {
      alert('Ошибка при обновлении статуса');
    }
  };

  const handleAssign = async (id, userId) => {
    try {
      await adminUpdateFeedback(id, { assignedTo: userId || null });
      const user = users.find(u => u._id === userId);
      setFeedbacks(prev => prev.map(fb => fb._id === id ? { ...fb, assignee: userId ? { _id: userId, name: user?.name || '' } : null } : fb));
    } catch (e) {
      alert('Ошибка при назначении ответственного');
    }
  };

  const handleSetDeadline = async (id, deadline) => {
    try {
      await adminUpdateFeedback(id, { deadline });
      setFeedbacks(prev => prev.map(fb => fb._id === id ? { ...fb, deadline } : fb));
    } catch (e) {
      alert('Ошибка при установке срока');
    }
  };

  const grouped = {
    new: feedbacks.filter(fb => fb.status === 'new'),
    in_progress: feedbacks.filter(fb => fb.status === 'in_progress'),
    improvement: feedbacks.filter(fb => fb.status === 'improvement'),
    resolved: feedbacks.filter(fb => fb.status === 'resolved'),
    rejected: feedbacks.filter(fb => fb.status === 'rejected'),
  };

  const stats = {
    total: feedbacks.length,
    new: grouped.new.length,
    in_progress: grouped.in_progress.length,
    improvement: grouped.improvement.length,
    resolved: grouped.resolved.length,
    overdue: feedbacks.filter(fb => fb.deadline && new Date(fb.deadline) < new Date() && fb.status !== 'resolved' && fb.status !== 'rejected').length,
  };

  return (
    <div style={{ padding: '20px 0', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            💬 Обратная связь
          </h1>
          <p style={{ color: '#888', margin: '4px 0 0', fontSize: 13 }}>
            Заявки от фронтменов • Канбан-доска
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 6 }}>
            {stats.overdue > 0 && (
              <div style={{ background: '#ffebee', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#d32f2f', fontWeight: 700 }}>ПРОСРОЧЕНО</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#d32f2f' }}>{stats.overdue}</div>
              </div>
            )}
            <div style={{ background: '#e3f2fd', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#1976d2', fontWeight: 700 }}>НОВЫХ</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1976d2' }}>{stats.new}</div>
            </div>
            <div style={{ background: '#fff3e0', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#f57c00', fontWeight: 700 }}>В РАБОТЕ</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#f57c00' }}>{stats.in_progress}</div>
            </div>
            <div style={{ background: '#f3e5f5', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#9c27b0', fontWeight: 700 }}>УЛУЧШЕНИЕ</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#9c27b0' }}>{stats.improvement}</div>
            </div>
          </div>

          <Link to="/admin/feedback/new" style={{
            background: '#1976d2', color: '#fff', padding: '10px 20px', borderRadius: 8,
            textDecoration: 'none', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6
          }}>
            + Новая заявка
          </Link>
        </div>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>Загрузка...</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 20 }}>
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col.key}
                column={col}
                feedbacks={grouped[col.key] || []}
                onMove={handleMove}
                users={users}
                onAssign={handleAssign}
                onSetDeadline={handleSetDeadline}
              />
            ))}
          </div>

          {/* Rejected section */}
          {grouped.rejected.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e0e0e0' }}>
              <button onClick={() => setShowRejected(!showRejected)} style={{
                display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#666', padding: 0
              }}>
                <span>{showRejected ? '▾' : '▸'}</span>
                Отклонённые ({grouped.rejected.length})
              </button>
              {showRejected && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
                  {grouped.rejected.map(fb => (
                    <FeedbackCard key={fb._id} fb={fb} onMove={handleMove} users={users} onAssign={handleAssign} onSetDeadline={handleSetDeadline} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
