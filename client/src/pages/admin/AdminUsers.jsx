import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminGetUsers, adminDeleteUser, adminUpdateUser, adminGetUserActivity, adminSetUserPassword } from '../../api/index';

const ONLINE_MS = 3 * 60 * 1000;

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

function daysSinceLastSeen(lastSeen) {
  if (!lastSeen) return 999;
  return Math.floor((Date.now() - new Date(lastSeen).getTime()) / 86400000);
}

function formatHours(minutes) {
  if (!minutes) return '0м';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}м`;
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
}

function formatTime(minutes) {
  if (!minutes) return '0м';
  if (minutes < 60) return `${minutes}м`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
}

const AVATAR_COLORS = {
  owner:     '#000',
  editor:    '#7b3fa0',
  viewer:    '#1a6fb5',
  navigator: '#0d9488',
  warehouse: '#b45309',
  purchaser: '#15803d',
  banned:    '#c0392b',
  user:      '#888',
  pending:   '#c47a00',
};

const ROLE_LABELS = {
  owner:     '👑 Владелец',
  editor:    '✏️ Редактор',
  viewer:    '👁️ Просмотр',
  navigator: '🧭 Навигатор',
  warehouse: '📦 Склад',
  purchaser: '🛒 Закупщик',
  banned:    '🚫 Заблокирован',
  user:      '👤 Пользователь',
};

function ActivityBadge({ days }) {
  if (days === 0) return <span style={{ background: '#dcfce7', color: '#16a34a', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>Сегодня</span>;
  if (days === 1) return <span style={{ background: '#dbeafe', color: '#2563eb', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>Вчера</span>;
  if (days <= 7) return <span style={{ background: '#fef3c7', color: '#d97706', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{days} дн</span>;
  if (days <= 30) return <span style={{ background: '#fee2e2', color: '#dc2626', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{days} дн</span>;
  return <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>30+ дн</span>;
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const isOwner = me?.role === 'owner';
  const canViewUsers = me?.canViewUsers;
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('activity');
  const [selectedUser, setSelectedUser] = useState(null);
  const [activityData, setActivityData] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  // Смена пароля пользователя владельцем
  const [pwdUser, setPwdUser] = useState(null);
  const [pwdValue, setPwdValue] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdDone, setPwdDone] = useState(false);

  useEffect(() => {
    adminGetUsers()
      .then(r => setUsers(r.data))
      .finally(() => setLoading(false));
  }, []);

  const loadActivity = async (userId) => {
    setActivityLoading(true);
    try {
      const res = await adminGetUserActivity(userId);
      setActivityData(res.data);
    } catch (e) {
      setActivityData({ visits: [], totalVisits: 0 });
    } finally {
      setActivityLoading(false);
    }
  };

  const openUserActivity = (u) => {
    setSelectedUser(u);
    loadActivity(u._id);
  };

  const filteredUsers = useMemo(() => {
    let result = users.filter(u => !u.isPending);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }

    if (sortBy === 'activity') {
      result.sort((a, b) => {
        const aOnline = isOnline(a.lastSeen);
        const bOnline = isOnline(b.lastSeen);
        if (aOnline !== bOnline) return bOnline - aOnline;
        return daysSinceLastSeen(a.lastSeen) - daysSinceLastSeen(b.lastSeen);
      });
    } else if (sortBy === 'name') {
      result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
    } else if (sortBy === 'inactive') {
      result.sort((a, b) => daysSinceLastSeen(b.lastSeen) - daysSinceLastSeen(a.lastSeen));
    }

    return result;
  }, [users, search, sortBy]);

  const pending = users.filter(u => u.isPending);

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

  const openPwdModal = (u) => {
    setPwdUser(u);
    setPwdValue('');
    setPwdError('');
    setPwdDone(false);
  };

  const handleSetPassword = async () => {
    if (pwdValue.length < 6) {
      setPwdError('Минимум 6 символов');
      return;
    }
    setPwdSaving(true);
    setPwdError('');
    try {
      await adminSetUserPassword(pwdUser._id, pwdValue);
      setPwdDone(true);
    } catch (e) {
      setPwdError(e.response?.data?.error || 'Не удалось сменить пароль');
    } finally {
      setPwdSaving(false);
    }
  };

  const handleApprove = async (u) => {
    setSaving(u._id);
    try {
      const res = await adminUpdateUser(u._id, { role: 'viewer', isPending: false });
      setUsers(prev => prev.map(x => x._id === u._id ? res.data : x));
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="admin-empty">Загрузка...</div>;

  const onlineCount = users.filter(u => isOnline(u.lastSeen)).length;
  const activeToday = users.filter(u => daysSinceLastSeen(u.lastSeen) === 0).length;
  const inactive7d = users.filter(u => daysSinceLastSeen(u.lastSeen) > 7 && !u.isPending).length;

  const renderUser = (u) => {
    const online = isOnline(u.lastSeen);
    const avatarColor = u.isPending ? AVATAR_COLORS.pending : AVATAR_COLORS[u.role] || '#888';
    const isSelf = u._id === me?._id;
    const days = daysSinceLastSeen(u.lastSeen);

    return (
      <div key={u._id} style={{
        background: '#fff',
        border: u.isPending ? '1.5px solid #ecd9ad' : '1px solid var(--admin-line)',
        borderRadius: 14,
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        flexWrap: 'wrap',
        opacity: saving === u._id ? 0.6 : 1,
        transition: 'all .2s',
        cursor: 'pointer',
      }}
      onClick={() => !u.isPending && openUserActivity(u)}
      onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
      >
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
          }} title={online ? 'Онлайн' : 'Оффлайн'} />
        </div>

        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#000', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {u.name}
            {isSelf && <span style={{ fontSize: 10, background: '#e8e8e8', color: '#555', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Это вы</span>}
            {online && <span style={{ fontSize: 10, background: '#e6f4ea', color: '#2d7a3a', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>● онлайн</span>}
            {u.telegramChatId && (
              <span title="Telegram подключён" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: '50%', background: '#229ED9', flexShrink: 0,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="white">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 2 }}>{u.email}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!u.isPending && <ActivityBadge days={days} />}
        </div>

        <div style={{ fontSize: 12, color: 'var(--slate)', minWidth: 90, textAlign: 'center' }}>
          {online ? <span style={{ color: '#2d7a3a', fontWeight: 600 }}>сейчас</span> : timeAgo(u.lastSeen || u.updatedAt)}
        </div>

        <div className="admin-user-actions" onClick={e => e.stopPropagation()}>
          {u.isPending ? (
            isOwner ? (
              <button
                className="btn btn-sm"
                style={{ background: '#2d7a3a', color: '#fff', border: 'none', fontSize: 13, padding: '8px 16px' }}
                onClick={() => handleApprove(u)}
                disabled={saving === u._id}
              >
                ✓ Одобрить
              </button>
            ) : (
              <div style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#fff8e1', color: '#c47a00', border: '1.5px solid #f0c060' }}>
                ⏳ Ожидает
              </div>
            )
          ) : u.role === 'owner' ? (
            <div style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: '#000', color: '#fff', minWidth: 120, textAlign: 'center',
            }}>
              👑 Владелец
            </div>
          ) : isOwner ? (
            <select
              value={u.role}
              disabled={isSelf || saving === u._id}
              onChange={e => handleRoleChange(u, e.target.value)}
              style={{
                padding: '7px 12px', borderRadius: 8,
                border: '1.5px solid var(--admin-line)',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                cursor: isSelf ? 'not-allowed' : 'pointer',
                background: '#fff',
                color: AVATAR_COLORS[u.role] || '#333',
                outline: 'none', minWidth: 140,
              }}
            >
              <option value="editor">✏️ Редактор</option>
              <option value="viewer">👁️ Просмотр</option>
              <option value="navigator">🧭 Навигатор</option>
              <option value="warehouse">📦 Склад</option>
              <option value="purchaser">🛒 Закупщик</option>
              <option value="banned">🚫 Запретить</option>
            </select>
          ) : (
            <div style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: '#f4f3f0', color: AVATAR_COLORS[u.role] || '#333',
              border: '1.5px solid var(--admin-line)', minWidth: 120, textAlign: 'center',
            }}>
              {ROLE_LABELS[u.role] || u.role}
            </div>
          )}

          {!isSelf && isOwner && !u.isPending && (
            <button
              className="btn btn-sm"
              style={{ background: '#eef2ff', color: '#4338ca', border: 'none', fontSize: 13, padding: '8px 14px' }}
              onClick={() => openPwdModal(u)}
              title="Задать пользователю новый пароль"
            >
              🔑 Пароль
            </button>
          )}

          {!isSelf && isOwner && (
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

      {/* Статистика */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ background: '#e6f4ea', borderRadius: 10, padding: '12px 20px', flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2d7a3a' }}>{onlineCount}</div>
          <div style={{ fontSize: 12, color: '#2d7a3a' }}>Онлайн сейчас</div>
        </div>
        <div style={{ background: '#dbeafe', borderRadius: 10, padding: '12px 20px', flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb' }}>{activeToday}</div>
          <div style={{ fontSize: 12, color: '#2563eb' }}>Активны сегодня</div>
        </div>
        <div style={{ background: '#fee2e2', borderRadius: 10, padding: '12px 20px', flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626' }}>{inactive7d}</div>
          <div style={{ fontSize: 12, color: '#dc2626' }}>Неактивны 7+ дн</div>
        </div>
      </div>

      {/* Поиск и сортировка */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="🔍 Поиск по имени или email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10,
            border: '1.5px solid var(--admin-line)', fontSize: 14,
            outline: 'none',
          }}
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: 10,
            border: '1.5px solid var(--admin-line)', fontSize: 14,
            background: '#fff', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <option value="activity">🔥 По активности</option>
          <option value="name">📝 По имени</option>
          <option value="inactive">😴 Неактивные первые</option>
        </select>
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

      {filteredUsers.length > 0 && (
        <div>
          <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--slate)', marginBottom: 12 }}>
            {search ? `Найдено — ${filteredUsers.length}` : `Все сотрудники — ${filteredUsers.length}`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredUsers.map(renderUser)}
          </div>
        </div>
      )}

      {!filteredUsers.length && search && (
        <div className="admin-empty">Ничего не найдено по запросу "{search}"</div>
      )}

      {/* Модалка активности пользователя */}
      {selectedUser && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          padding: 16,
        }} onClick={() => { setSelectedUser(null); setActivityData(null); }}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: 28,
            maxWidth: 500, width: '100%', maxHeight: '85vh', overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,.25)',
          }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: AVATAR_COLORS[selectedUser.role] || '#888', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 22,
              }}>
                {selectedUser.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{selectedUser.name}</h3>
                <div style={{ color: 'var(--slate)', fontSize: 14 }}>{selectedUser.email}</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{
                    background: AVATAR_COLORS[selectedUser.role] + '20',
                    color: AVATAR_COLORS[selectedUser.role],
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  }}>
                    {ROLE_LABELS[selectedUser.role] || selectedUser.role}
                  </span>
                </div>
              </div>
              <button onClick={() => { setSelectedUser(null); setActivityData(null); }} style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: '#f3f4f6', fontSize: 18, cursor: 'pointer',
              }}>✕</button>
            </div>

            {/* Activity stats */}
            {activityLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Загрузка...</div>
            ) : activityData ? (
              <>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, textAlign: 'center' }}>
                  Отсчёт времени начался с 3 июля 2026
                </div>
                <div style={{ background: '#f0f9ff', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ fontSize: 36, fontWeight: 800, color: '#0369a1' }}>{formatHours(activityData.totalMinutes)}</div>
                  <div style={{ fontSize: 13, color: '#0369a1' }}>Всего времени на сайте</div>
                </div>

                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>⏱ Время на сайте по дням</div>
                {activityData.days?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflow: 'auto' }}>
                    {activityData.days.map((d, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', background: '#f9fafb', borderRadius: 10,
                      }}>
                        <span style={{ fontSize: 14, color: '#374151' }}>
                          {new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' })}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: Math.min(d.minutes, 120), height: 8,
                            background: d.minutes >= 60 ? '#22c55e' : d.minutes >= 15 ? '#fbbf24' : '#ef4444',
                            borderRadius: 4,
                          }} />
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#111', minWidth: 64, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {formatTime(d.minutes)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 24, color: '#888', background: '#f9fafb', borderRadius: 10 }}>
                    Нет данных о времени
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Нет данных</div>
            )}
          </div>
        </div>
      )}

      {/* Смена пароля пользователю */}
      {pwdUser && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          padding: 16,
        }} onClick={() => setPwdUser(null)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 32,
            maxWidth: 400, width: '100%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,.2)',
          }} onClick={e => e.stopPropagation()}>
            {pwdDone ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Пароль изменён</h3>
                <p style={{ color: 'var(--slate)', fontSize: 14, margin: '0 0 24px' }}>
                  Передайте <strong>{pwdUser.name}</strong> новый пароль:<br />
                  <code style={{ display: 'inline-block', marginTop: 8, padding: '6px 12px', background: '#f3f4f6', borderRadius: 8, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>{pwdValue}</code>
                </p>
                <button className="btn" style={{ background: '#000', color: '#fff', border: 'none', padding: '10px 28px', fontSize: 14, fontWeight: 700, borderRadius: 8, cursor: 'pointer' }} onClick={() => setPwdUser(null)}>
                  Готово
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🔑</div>
                <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Новый пароль</h3>
                <p style={{ color: 'var(--slate)', fontSize: 14, margin: '0 0 20px' }}>
                  Для <strong>{pwdUser.name}</strong> ({pwdUser.email}).<br />
                  Аккаунт и статистика сохранятся.
                </p>
                <input
                  type="text"
                  autoFocus
                  value={pwdValue}
                  onChange={e => { setPwdValue(e.target.value); setPwdError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSetPassword(); }}
                  placeholder="Минимум 6 символов"
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10,
                    border: `1.5px solid ${pwdError ? '#e10523' : 'var(--admin-line)'}`,
                    fontSize: 15, outline: 'none', marginBottom: pwdError ? 6 : 20,
                  }}
                />
                {pwdError && <div style={{ color: '#e10523', fontSize: 13, marginBottom: 16, textAlign: 'left' }}>{pwdError}</div>}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button className="btn btn-ghost" onClick={() => setPwdUser(null)} disabled={pwdSaving}>Отмена</button>
                  <button
                    style={{ background: '#4338ca', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, fontWeight: 700, borderRadius: 8, cursor: 'pointer', opacity: pwdSaving ? 0.6 : 1 }}
                    onClick={handleSetPassword}
                    disabled={pwdSaving}
                  >
                    {pwdSaving ? 'Сохранение…' : 'Сменить пароль'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
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
