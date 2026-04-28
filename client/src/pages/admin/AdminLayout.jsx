import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Admin.css';

const NAV_ALL = [
  { to: '/admin',          label: 'Дашборд',      icon: '◻', end: true, roles: ['owner','editor','viewer'] },
  { to: '/admin/products', label: 'Товары',       icon: '📦', roles: ['owner','editor','viewer'] },
  { to: '/admin/map',      label: 'Product Map',  icon: '🗺', roles: ['owner','editor','viewer'] },
  { to: '/admin/users',    label: 'Пользователи', icon: '👥', roles: ['owner'] },
  { to: '/admin/brands',   label: 'Бренды',       icon: '🏷', roles: ['owner','editor'] },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const ALLOWED = ['owner', 'editor', 'viewer'];
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
        <Outlet />
      </main>
    </div>
  );
}
