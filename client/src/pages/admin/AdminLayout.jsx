import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminStats } from '../../api';
import './Admin.css';

const NAV_ALL = [
  { to: '/admin',          label: 'Дашборд',             icon: '◻', end: true, roles: ['owner','editor','viewer'] },
  { to: '/admin/sets',     label: 'Товары и фронтмены',  icon: '🗂', roles: ['owner','editor','viewer'] },
  { to: '/admin/frontmen', label: 'Фронтмены',           icon: '👤', roles: ['owner','editor','viewer'] },
  { to: '/admin/users',     label: 'Пользователи',       icon: '👥', roles: ['owner', 'editor', 'viewer'] },
  { to: '/admin/stock-log',  label: 'История остатков',  icon: '📦', roles: ['owner','editor'] },
  { to: '/admin/price-log',  label: 'История цен',       icon: '💰', roles: ['owner','editor'] },
  { to: '/admin/changelog',  label: 'История изменений', icon: '📋', roles: ['owner'] },
];

export default function AdminLayout() {
  const { user, logout, loading, authError, checkAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Reset body overflow on every navigation (guard against modal scroll-lock leaking)
  useEffect(() => {
    document.body.style.overflow = '';
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    const load = () => adminStats().then(r => setPendingCount(r.data.pending || 0)).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [!!user]);

  const ALLOWED = ['owner', 'editor', 'viewer'];

  // Waiting for AuthContext to verify token
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f8fa' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e0e0e0', borderTopColor: '#000', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // Network/server error — show retry instead of redirecting to login
  if (authError) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#f7f8fa' }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <p style={{ fontSize: 15, color: '#555', margin: 0 }}>Сервер не отвечает. Повторите попытку.</p>
      <button
        onClick={checkAuth}
        style={{ padding: '10px 28px', borderRadius: 8, background: '#111', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
      >Повторить</button>
    </div>
  );

  if (!user || !ALLOWED.includes(user.role)) {
    return <Navigate to="/admin/login" replace />;
  }

  const close = () => setSidebarOpen(false);

  return (
    <div className="admin-shell">

      {/* Mobile top bar */}
      <div className="admin-mobile-bar">
        <button className="admin-burger" onClick={() => setSidebarOpen(o => !o)} aria-label="Меню">
          <span /><span /><span />
        </button>
        <img src="/logos/logo-main.png" alt="MATKASYM" style={{ height: 26 }} />
        <span className="admin-sidebar-tag" style={{ fontSize: 8 }}>Product Matrix</span>
      </div>

      {/* Overlay */}
      {sidebarOpen && <div className="admin-sidebar-overlay" onClick={close} />}

      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-logo">
          <img src="/logos/logo-main.png" alt="MATKASYM" />
          <span className="admin-sidebar-tag">Product Matrix</span>
        </div>

        <nav className="admin-nav">
          {NAV_ALL.filter(n => n.roles.includes(user.role)).map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
              onClick={close}
            >
              <span className="admin-nav-icon">{n.icon}</span>
              {n.label}
              {n.to === '/admin/users' && pendingCount > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: '#e10523',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 10,
                  padding: '1px 7px',
                  minWidth: 18,
                  textAlign: 'center',
                  lineHeight: '18px',
                }}>
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <span className="admin-user-name">{user.name}</span>
          <button className="admin-logout" onClick={() => { logout(); navigate('/'); }}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div key={location.pathname} className="admin-page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
