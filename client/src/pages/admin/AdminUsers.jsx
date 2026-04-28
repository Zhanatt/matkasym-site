import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminGetUsers, adminDeleteUser, adminUpdateUser } from '../../api/index';

const ONLINE_MS = 3 * 60 * 1000; // 3 minutes

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_MS;
}

function timeAgo(date) {
  if (!date) return '—';
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60)    return 'только что';
  if (diff < 3600)  return Math.floor(diff / 60) + ' мин назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
  const days = Math.floor(diff / 86400);
  if (days < 30)    return days + ' дн назад';
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

const AVATAR_COLORS = {
  owner:  '#000',
  editor: '#7b3fa0',
  viewer: '#1a6fb5',
  banned: '#c0392b',
  user:   '#888',
  pending:'#c47a00',
};

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving]   = useState(null); // id being saved

  useEffect(() => {
    adminGetUsers()
      .then(r => setUsers(r.data))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id) => {
    await adminDeleteUser(id);
    setConfirm(null);
    setUsers(prev => prev.filter(u => u._id !== id));
  };

  const handleRoleChange = async (u, newRole) => {
    setSaving(u._id);
    try {
      const res = await adminUpdateUser(u._id, { role: newRole, isPending: false });
      setUsers(prev => prev.map(x => x._id === u._id ? res.data : x));
    } finally {
      setSaving(null);
    }
  };

  const handleApprove = async (u) => {
    setSaving(u._id);
    try {
      const res = await adminUpdateUser(u._id, { role: 'admin', isPending: false });
      setUsers(prev => prev.map(x => x._id === u._id ? res.data : x));
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="admin-empty">Загрузка...</div>;

  const onlineCount = users.filter(u => isOnline(u.lastSeen)).length;
  const pending = users.filter(u => u.isPending);
  const active  = users.filter(u => !u.isPending);

  const renderUser = (u) => {
    const online = isOnline(u.lastSeen);
    const avatarColor = u.isPending ? AVATAR_COLORS.pending : AVATAR_COLORS[u.role] || '#888';
    const isSelf = u._id === me?._id;

    return (
      <div key={u._id} className="admin-user-card" style={{
        background: '#fff',
        border: u.isPending ? '1.5px solid #f0c060' : '1px solid var(--gray-200)',
        borderRadius: 10,
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        flexWrap: 'wrap',
        opacity: saving === u._id ? 0.6 : 1,
        transition: 'opacity .2s',
      }}>

        {/* Avatar + online dot */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%',
            background: avatarColor, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 17,
          }}>
            {u.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{
            position: 'absolute', bottom: 1, right: 1,
            width: 11, height: 11, borderRadius: '50%',
            background: online ? '#2d7a3a' : '#ccc',
            border: '2px solid #fff',
            title: online ? 'Онлайн' : 'Оффлайн',
          }} title={online ? 'Онлайн' : 'Оффлайн'} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#000', display: 'flex', alignItems: 'center', gap: 8 }}>
            {u.name}
            {isSelf && <span style={{ fontSize: 10, background: '#e8e8e8', color: '#555', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Это вы</span>}
            {online && <span style={{ fontSize: 10, background: '#e6f4ea', color: '#2d7a3a', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>● онлайн</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 2 }}>{u.email}</div>
        </div>

        {/* Last seen */}
        <div className="admin-user-meta" style={{ fontSize: 12, color: 'var(--slate)', minWidth: 90, textAlign: 'center' }}>
          {online ? <span style={{ color: '#2d7a3a', fontWeight: 600 }}>сейчас</span> : timeAgo(u.lastSeen || u.updatedAt)}
        </div>

        {/* Role + Delete actions */}
        <div className="admin-user-actions">
          {u.isPending ? (
            <button
              className="btn btn-sm"
              style={{ background: '#2d7a3a', color: '#fff', border: 'none', fontSize: 13, padding: '8px 16px' }}
              onClick={() => handleApprove(u)}
              disabled={saving === u._id}
            >
              ✓ Одобрить доступ
            </button>
          ) : u.role === 'owner' ? (
            <div style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: '#000', color: '#fff', minWidth: 140, textAlign: 'center',
            }}>
              👑 Владелец
            </div>
          ) : (
            <select
              value={u.role}
              disabled={isSelf || saving === u._id}
              onChange={e => handleRoleChange(u, e.target.value)}
              style={{
                padding: '7px 12px', borderRadius: 8,
                border: '1.5px solid var(--gray-200)',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                cursor: isSelf ? 'not-allowed' : 'pointer',
                background: '#fff',
                color: AVATAR_COLORS[u.role] || '#333',
                outline: 'none', minWidth: 160,
              }}
            >
              <option value="editor">✏️ Редактор</option>
              <option value="viewer">👁️ Просмотр</option>
              <option value="banned">🚫 Запретить доступ</option>
            </select>
          )}

          {!isSelf && (
            <button
              className="btn btn-sm"
              style={{ background: '#fde8e8', color: '#c0392b', border: 'none', fontSize: 13, padding: '8px 14px' }}
              onClick={() => setConfirm(u)}
            >
              Удалить
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Пользователи</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            Всего: {users.length} · <span style={{ color: '#2d7a3a', fontWeight: 600 }}>● онлайн: {onlineCount}</span>
          </p>
        </div>
      </div>

      {pending.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#c47a00', marginBottom: 12 }}>
            ⏳ Ожидают подтверждения — {pending.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(renderUser)}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--slate)', marginBottom: 12 }}>
            Все пользователи — {active.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.sort((a, b) => isOnline(b.lastSeen) - isOnline(a.lastSeen)).map(renderUser)}
          </div>
        </div>
      )}

      {!users.length && <div className="admin-empty">Нет пользователей</div>}

      {/* Confirm delete */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setConfirm(null)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 32,
            maxWidth: 380, width: '90%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,.2)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Удалить пользователя?</h3>
            <p style={{ color: 'var(--slate)', fontSize: 14, margin: '0 0 24px' }}>
              <strong>{confirm.name}</strong> ({confirm.email})<br />
              будет удалён без возможности восстановления.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Отмена</button>
              <button
                style={{ background: '#e10523', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, fontWeight: 700, borderRadius: 8, cursor: 'pointer' }}
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
