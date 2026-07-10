import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminGetTechRequests, adminUpdateTechRequest, adminGetUsers } from '../../api';
import { COLUMNS, PRIORITIES, legalStatus, symbolType } from '../../config/techRequest';

function avatar(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
}

function daysLeft(deadline) {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
}

// Модалка результата — обязательна перед закрытием заявки
function ResultModal({ request, onClose, onSubmit }) {
  const [text, setText] = useState(request.result?.description || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    await onSubmit(request._id, 'done', { description: text.trim() });
    setSaving(false);
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>✅ Готовый техлист</h3>
        <p style={{ margin: '0 0 16px', color: '#666', fontSize: 13 }}>
          Опишите что сделано. Без результата заявку нельзя закрыть.
        </p>

        <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>ТЗ-{request.number} · {request.client?.name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{request.item?.name || 'Изделие'} · {request.item?.dimensions}</div>
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Ссылка на чертёж, номер техлиста, что изменено..."
          rows={6}
          style={{ width: '100%', padding: 12, borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 8, border: '1.5px solid #e0e0e0', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={saving || !text.trim()}
            style={{
              flex: 2, padding: '12px 0', borderRadius: 8, border: 'none',
              background: text.trim() ? '#388e3c' : '#e0e0e0',
              color: text.trim() ? '#fff' : '#999',
              fontSize: 14, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Сохранение...' : '✅ Закрыть заявку'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestCard({ req, users, onMove, onAssign, onSetDeadline, onRequestDone, onDragStart }) {
  const navigate = useNavigate();
  const priority = PRIORITIES[req.priority] || PRIORITIES.medium;
  const status = legalStatus(req.client?.legalStatus);
  const days = daysLeft(req.deadline);
  const isOverdue = days !== null && days < 0 && req.status !== 'done';
  const isUrgent = days !== null && days >= 0 && days <= 2 && req.status !== 'done';

  const [showAssign, setShowAssign] = useState(false);
  const [showDeadline, setShowDeadline] = useState(false);
  const [deadlineVal, setDeadlineVal] = useState(req.deadline ? req.deadline.split('T')[0] : '');

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, req._id)}
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        border: isOverdue ? '2px solid #d32f2f' : isUrgent ? '2px solid #f57c00' : '1px solid rgba(0,0,0,0.06)',
        cursor: 'grab',
        transition: 'transform 0.15s, box-shadow 0.15s',
        position: 'relative',
      }}
      onClick={() => navigate(`/admin/tech-requests/${req._id}`)}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
    >
      {/* Номер + приоритет + символика */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ background: '#eceff1', color: '#455a64', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800 }}>
          ТЗ-{req.number}
        </span>
        <span style={{ background: priority.bg, color: priority.color, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
          {priority.label}
        </span>
        {req.symbols?.has && (
          <span style={{ background: '#ede7f6', color: '#5e35b1', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
            {(req.symbols.types || []).slice(0, 3).map(t => symbolType(t).icon).join('') || '✳️'} Символика
          </span>
        )}
        {req.spec?.media?.length > 0 && (
          <span style={{ fontSize: 10, color: '#888' }}>📎 {req.spec.media.length}</span>
        )}
      </div>

      {/* Клиент */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#111', lineHeight: 1.3 }}>
          {req.client?.name}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
          {status.short}
          {req.client?.companyName ? ` · ${req.client.companyName}` : ''}
        </div>
      </div>

      {/* Изделие: размеры, цвет, кол-во */}
      <div style={{ background: '#fafafa', borderRadius: 8, padding: 8, marginBottom: 10, fontSize: 11, color: '#555', lineHeight: 1.6 }}>
        {req.item?.name && <div style={{ fontWeight: 700, color: '#333' }}>{req.item.name}</div>}
        <div>📐 {req.item?.dimensions}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span>🎨 {req.item?.color}</span>
          {req.item?.quantity > 1 && <span>✖️ {req.item.quantity} шт.</span>}
        </div>
      </div>

      {/* Автор + дата */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#888', marginBottom: 10, flexWrap: 'wrap' }}>
        <span>👤 {req.createdBy?.name || '—'}</span>
        <span>📅 {formatDate(req.createdAt)}</span>
      </div>

      {/* Срок */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }} onClick={e => e.stopPropagation()}>
        {req.deadline ? (
          <div
            onClick={() => setShowDeadline(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
              background: isOverdue ? '#ffebee' : isUrgent ? '#fff3e0' : '#f5f5f5',
              color: isOverdue ? '#d32f2f' : isUrgent ? '#f57c00' : '#666',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            🗓 {formatDate(req.deadline)}
            {isOverdue && <span style={{ marginLeft: 4 }}>просрочено</span>}
            {isUrgent && !isOverdue && <span style={{ marginLeft: 4 }}>{days} дн.</span>}
          </div>
        ) : (
          <button onClick={() => setShowDeadline(true)} style={{ background: 'none', border: '1px dashed #ccc', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#888', cursor: 'pointer' }}>
            + Срок
          </button>
        )}

        {showDeadline && (
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
            <input type="date" value={deadlineVal} onChange={e => setDeadlineVal(e.target.value)} style={{ padding: 6, borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => { if (deadlineVal) onSetDeadline(req._id, deadlineVal); setShowDeadline(false); }} style={{ flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#1976d2', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>ОК</button>
              <button onClick={() => setShowDeadline(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 11, cursor: 'pointer' }}>✕</button>
            </div>
          </div>
        )}
      </div>

      {/* Конструктор */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} onClick={e => e.stopPropagation()}>
        {req.assignedTo ? (
          <div onClick={() => setShowAssign(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1976d2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
              {avatar(req.assignedTo.name)}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#333' }}>{req.assignedTo.name}</span>
          </div>
        ) : (
          <button onClick={() => setShowAssign(true)} style={{ background: 'none', border: '1px dashed #ccc', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#888', cursor: 'pointer' }}>
            + Конструктор
          </button>
        )}

        {showAssign && (
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 200, maxHeight: 220, overflowY: 'auto' }}>
            <div style={{ padding: '6px 10px', fontSize: 10, color: '#888', fontWeight: 600, borderBottom: '1px solid #f0f0f0' }}>ВЫБРАТЬ</div>
            {users.map(u => (
              <div
                key={u._id}
                onClick={() => { onAssign(req._id, u._id); setShowAssign(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #fafafa' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f8ff'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1976d2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                  {avatar(u.name)}
                </div>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{u.name}</span>
              </div>
            ))}
            {req.assignedTo && (
              <div onClick={() => { onAssign(req._id, null); setShowAssign(false); }} style={{ padding: '8px 10px', cursor: 'pointer', color: '#d32f2f', fontSize: 11, fontWeight: 600, borderTop: '1px solid #f0f0f0' }}>
                Снять конструктора
              </div>
            )}
            <div onClick={() => setShowAssign(false)} style={{ padding: '6px 10px', cursor: 'pointer', color: '#888', fontSize: 11, textAlign: 'center', borderTop: '1px solid #f0f0f0' }}>
              Отмена
            </div>
          </div>
        )}
      </div>

      {/* Кнопки перехода */}
      {req.status !== 'done' && req.status !== 'rejected' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f0f0' }} onClick={e => e.stopPropagation()}>
          {req.status === 'new' && (
            <button onClick={() => onMove(req._id, 'in_progress')} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: '#fff3e0', color: '#f57c00', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ⚡ Взять в работу
            </button>
          )}
          {req.status === 'in_progress' && (
            <button onClick={() => onMove(req._id, 'review')} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: '#f3e5f5', color: '#9c27b0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              👀 На согласование
            </button>
          )}
          {req.status === 'review' && (
            <button onClick={() => onRequestDone(req)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: '#e8f5e9', color: '#388e3c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ✅ Готово
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ column, requests, onDrop, ...cardProps }) {
  const [over, setOver] = useState(false);

  return (
    <div
      style={{ flex: 1, minWidth: 300, maxWidth: 360 }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(e, column.key); }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 12px', background: column.bg, borderRadius: 10 }}>
        <span style={{ fontSize: 16 }}>{column.icon}</span>
        <span style={{ fontWeight: 800, fontSize: 14, color: column.color }}>{column.label}</span>
        <span style={{ marginLeft: 'auto', background: column.color, color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
          {requests.length}
        </span>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10, minHeight: 200,
        borderRadius: 10,
        background: over ? `${column.bg}80` : 'transparent',
        outline: over ? `2px dashed ${column.color}` : 'none',
        padding: over ? 6 : 0,
        transition: 'background 0.15s',
      }}>
        {requests.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: '#ccc', fontSize: 12 }}>Пусто</div>
        )}
        {requests.map(req => (
          <RequestCard key={req._id} req={req} {...cardProps} />
        ))}
      </div>
    </div>
  );
}

export default function AdminTechRequests() {
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRejected, setShowRejected] = useState(false);
  const [doneModal, setDoneModal] = useState(null); // заявка, которую закрываем

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetTechRequests({});
      setRequests(res.data.requests || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminGetUsers()
      .then(r => setUsers((r.data || []).filter(u => ['owner', 'editor', 'viewer'].includes(u.role))))
      .catch(() => {});
  }, []);

  const patch = async (id, body, optimistic) => {
    try {
      await adminUpdateTechRequest(id, body);
      setRequests(prev => prev.map(r => r._id === id ? { ...r, ...optimistic } : r));
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка при обновлении заявки');
    }
  };

  const handleMove = (id, status) => patch(id, { status }, { status });

  const handleMoveDone = async (id, status, result) => {
    await patch(id, { status, result }, { status, result });
  };

  const handleAssign = (id, userId) => {
    const user = users.find(u => u._id === userId);
    return patch(id, { assignedTo: userId || null }, { assignedTo: userId ? { _id: userId, name: user?.name || '' } : null });
  };

  const handleSetDeadline = (id, deadline) => patch(id, { deadline }, { deadline });

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e, columnKey) => {
    const id = e.dataTransfer.getData('text/plain');
    const req = requests.find(r => r._id === id);
    if (!req || req.status === columnKey) return;
    // Закрытие заявки требует описания результата — открываем модалку
    if (columnKey === 'done' && !req.result?.description) {
      setDoneModal(req);
      return;
    }
    handleMove(id, columnKey);
  };

  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.key] = requests.filter(r => r.status === col.key);
    return acc;
  }, {});
  const rejected = requests.filter(r => r.status === 'rejected');

  const overdue = requests.filter(r =>
    r.deadline && new Date(r.deadline) < new Date() && !['done', 'rejected'].includes(r.status)
  ).length;

  const cardProps = {
    users,
    onMove: handleMove,
    onAssign: handleAssign,
    onSetDeadline: handleSetDeadline,
    onRequestDone: setDoneModal,
    onDragStart: handleDragStart,
  };

  return (
    <div style={{ padding: '20px 0', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            📋 Заявки на техлист
          </h1>
          <p style={{ color: '#888', margin: '4px 0 0', fontSize: 13 }}>
            ТЗ от навигаторов • Канбан-доска • Карточки можно перетаскивать
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {overdue > 0 && (
              <div style={{ background: '#ffebee', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#d32f2f', fontWeight: 700 }}>ПРОСРОЧЕНО</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#d32f2f' }}>{overdue}</div>
              </div>
            )}
            {COLUMNS.slice(0, 3).map(col => (
              <div key={col.key} style={{ background: col.bg, borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: col.color, fontWeight: 700, textTransform: 'uppercase' }}>{col.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: col.color }}>{grouped[col.key].length}</div>
              </div>
            ))}
          </div>

          <Link to="/admin/tech-requests/new" style={{ background: '#1976d2', color: '#fff', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            + Новая заявка
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>Загрузка...</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 20 }}>
            {COLUMNS.map(col => (
              <KanbanColumn key={col.key} column={col} requests={grouped[col.key]} onDrop={handleDrop} {...cardProps} />
            ))}
          </div>

          {rejected.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e0e0e0' }}>
              <button onClick={() => setShowRejected(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#666', padding: 0 }}>
                <span>{showRejected ? '▾' : '▸'}</span>
                Отклонённые ({rejected.length})
              </button>
              {showRejected && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
                  {rejected.map(req => <RequestCard key={req._id} req={req} {...cardProps} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {doneModal && (
        <ResultModal
          request={doneModal}
          onClose={() => setDoneModal(null)}
          onSubmit={handleMoveDone}
        />
      )}
    </div>
  );
}
