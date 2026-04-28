import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminGetUsers, adminDeleteUser, adminUpdateUser } from '../../api/index';

function timeAgo(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)    return 'только что';
  if (diff < 3600)  return Math.floor(diff / 60) + ' мин назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
  const days = Math.floor(diff / 86400);
  if (days < 30)    return days + ' дн назад';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ROLE_LABELS = { admin: 'Админ', user: 'Пользователь', pending: 'Ожидает' };
const ROLE_COLORS = { admin: '#2d7a3a', user: '#1a6fb5', pending: '#c47a00' };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // id to delete

  const load = () => {
    setLoading(true);
    adminGetUsers()
      .then(r => setUsers(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (id) => {
    await adminDeleteUser(id);
    setConfirm(null);
    setUsers(prev => prev.filter(u => u._id !== id));
  };

  const handleToggleRole = async (u) => {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    const updated = await adminUpdateUser(u._id, { role: newRole, isPending: false });
    setUsers(prev => prev.map(x => x._id === u._id ? updated.data : x));
  };

  const handleApprove = async (u) => {
    const updated = await adminUpdateUser(u._id, { role: 'admin', isPending: false });
    setUsers(prev => prev.map(x => x._id === u._id ? updated.data : x));
  };

  if (loading) return <div className="admin-empty">Загрузка...</div>;

  const admins  = users.filter(u => u.role === 'admin' && !u.isPending);
  const pending = users.filter(u => u.isPending);
  const regular = users.filter(u => u.role === 'user' && !u.isPending);

  const renderSection = (title, list, accentColor) => {
    if (!list.length) return null;
    return (
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: accentColor, marginBottom: 12 }}>
          {title} — {list.length}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(u => (
            <div key={u._id} style={{
              background: '#fff',
              border: u.isPending ? '1.5px solid #f0c060' : '1px solid var(--gray-200)',
              borderRadius: 10,
              padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
              flexWrap: 'wrap',
            }}>
              {/* Avatar */}
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: accentColor, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 16, flexShrink: 0,
              }}>
                {u.name?.[0]?.toUpperCase() || '?'}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#000', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {u.name}
                  {u._id === me?._id && (
                    <span style={{ fontSize: 10, background: '#e8e8e8', color: '#555', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Это вы</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 2 }}>{u.email}</div>
                {u.phone && <div style={{ fontSize: 12, color: 'var(--slate)' }}>{u.phone}</div>}
              </div>

              {/* Status badge */}
              <div style={{
                background: u.isPending ? '#fff8e6' : `${accentColor}18`,
                color: u.isPending ? '#c47a00' : accentColor,
                border: `1px solid ${u.isPending ? '#f0c060' : accentColor}40`,
                borderRadius: 6, padding: '4px 10px',
                fontSize: 12, fontWeight: 700,
              }}>
                {u.isPending ? '⏳ Ожидает' : ROLE_LABELS[u.role] || u.role}
              </div>

              {/* Last seen */}
              <div style={{ fontSize: 12, color: 'var(--slate)', minWidth: 100, textAlign: 'right' }}>
                {timeAgo(u.updatedAt || u.createdAt)}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                {u.isPending && (
                  <button
                    className="btn btn-sm"
                    style={{ background: '#2d7a3a', color: '#fff', border: 'none', fontSize: 12 }}
                    onClick={() => handleApprove(u)}
                  >
                    ✓ Одобрить
                  </button>
                )}
                {!u.isPending && u._id !== me?._id && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 12 }}
                    onClick={() => handleToggleRole(u)}
                    title={u.role === 'admin' ? 'Снять права админа' : 'Сделать админом'}
                  >
                    {u.role === 'admin' ? '↓ Пользователь' : '↑ Админ'}
                  </button>
                )}
                {u._id !== me?._id && (
                  <button
                    className="btn btn-sm"
                    style={{ background: '#fde8e8', color: '#c0392b', border: 'none', fontSize: 12 }}
                    onClick={() => setConfirm(u)}
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Пользователи</h1>
      </div>

      {renderSection('Администраторы', admins, '#2d7a3a')}
      {renderSection('Ожидают подтверждения', pending, '#c47a00')}
      {renderSection('Пользователи', regular, '#1a6fb5')}
      {!admins.length && !pending.length && !regular.length && (
        <div className="admin-empty">Нет пользователей</div>
      )}

      {/* Confirm delete modal */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 32,
            maxWidth: 380, width: '90%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,.2)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Удалить пользователя?</h3>
            <p style={{ color: 'var(--slate)', fontSize: 14, margin: '0 0 24px' }}>
              <strong>{confirm.name}</strong> ({confirm.email}) будет удалён без возможности восстановления.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Отмена</button>
              <button
                className="btn btn-sm"
                style={{ background: '#e10523', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14 }}
                onClick={() => handleDelete(confirm._id)}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
