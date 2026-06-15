import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetReceiveAlerts, adminUpdateReceiveAlert } from '../../api/index';

const ALERT_TYPES = {
  shortage: { label: 'Недостача', icon: '📉', color: '#f59e0b', bg: '#fffbeb' },
  excess:   { label: 'Излишек', icon: '📈', color: '#3b82f6', bg: '#eff6ff' },
  damaged:  { label: 'Повреждён', icon: '💔', color: '#ef4444', bg: '#fef2f2' },
  wrong:    { label: 'Не тот товар', icon: '❌', color: '#ef4444', bg: '#fef2f2' },
  other:    { label: 'Другое', icon: '⚠️', color: '#6b7280', bg: '#f3f4f6' },
};

const STATUS_LABELS = {
  pending:   { label: 'Ожидает', color: '#f59e0b' },
  resolved:  { label: 'Решено', color: '#22c55e' },
  dismissed: { label: 'Отклонено', color: '#6b7280' },
};

function timeAgo(date) {
  if (!date) return '';
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
  const days = Math.floor(diff / 86400);
  if (days < 7) return days + ' дн назад';
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function AdminReceiveAlerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [resolving, setResolving] = useState(null);

  useEffect(() => {
    setLoading(true);
    adminGetReceiveAlerts(filter)
      .then(res => setAlerts(res.data))
      .finally(() => setLoading(false));
  }, [filter]);

  const handleResolve = async (id, status) => {
    setResolving(id);
    try {
      const res = await adminUpdateReceiveAlert(id, { status });
      setAlerts(prev => prev.map(a => a._id === id ? res.data : a));
    } finally {
      setResolving(null);
    }
  };

  if (loading) return <div className="admin-empty">Загрузка...</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="admin-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="admin-page-title">Уведомления о приёме</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            Проблемы при приёме товара на склад
          </p>
        </div>
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'pending', label: 'Ожидают' },
          { key: 'resolved', label: 'Решённые' },
          { key: 'all', label: 'Все' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8,
              background: filter === f.key ? '#333' : '#f5f5f5',
              color: filter === f.key ? '#fff' : '#666',
              border: 'none', cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Список алертов */}
      {alerts.length === 0 ? (
        <div style={{
          padding: 60, textAlign: 'center', background: '#f8f8f8', borderRadius: 12,
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 15, color: '#888' }}>Нет уведомлений</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map(alert => {
            const type = ALERT_TYPES[alert.alertType] || ALERT_TYPES.other;
            const status = STATUS_LABELS[alert.status];

            return (
              <div
                key={alert._id}
                style={{
                  background: '#fff',
                  border: `2px solid ${alert.status === 'pending' ? type.color : '#e5e5e5'}`,
                  borderRadius: 12,
                  padding: 16,
                  opacity: alert.status === 'pending' ? 1 : 0.7,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: type.bg, color: type.color,
                      }}>
                        {type.icon} {type.label}
                      </span>
                      <span style={{ fontSize: 11, color: '#999' }}>{timeAgo(alert.createdAt)}</span>
                    </div>
                    <div
                      style={{ fontSize: 15, fontWeight: 600, color: '#333', cursor: 'pointer' }}
                      onClick={() => navigate(`/admin/sets`, { state: { searchSku: alert.productSku } })}
                    >
                      {alert.productName}
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>SKU: {alert.productSku}</div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: '#888' }}>
                      Ожидалось: <strong>{alert.expectedQty}</strong>
                    </div>
                    <div style={{
                      fontSize: 18, fontWeight: 700,
                      color: alert.receivedQty < alert.expectedQty ? '#ef4444' : alert.receivedQty > alert.expectedQty ? '#3b82f6' : '#333',
                    }}>
                      Получено: {alert.receivedQty}
                    </div>
                  </div>
                </div>

                {alert.comment && (
                  <div style={{
                    padding: '10px 12px', background: '#f8f8f8', borderRadius: 8,
                    fontSize: 13, color: '#555', marginBottom: 12,
                  }}>
                    💬 {alert.comment}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Принял: <strong>{alert.receivedByName}</strong>
                  </div>

                  {alert.status === 'pending' ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleResolve(alert._id, 'resolved')}
                        disabled={resolving === alert._id}
                        style={{
                          padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                          background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer',
                        }}
                      >
                        ✓ Решено
                      </button>
                      <button
                        onClick={() => handleResolve(alert._id, 'dismissed')}
                        disabled={resolving === alert._id}
                        style={{
                          padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                          background: '#f5f5f5', color: '#666', border: 'none', cursor: 'pointer',
                        }}
                      >
                        Отклонить
                      </button>
                    </div>
                  ) : (
                    <span style={{
                      padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: status.color + '20', color: status.color,
                    }}>
                      {status.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
