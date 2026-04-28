import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Admin.css';

const NAV = [
  { to: '/admin',          label: 'Дашборд',      icon: '◻', end: true },
  { to: '/admin/products', label: 'Товары',       icon: '📦' },
  { to: '/admin/map',      label: 'Product Map',  icon: '🗺' },
  { to: '/admin/users',    label: 'Пользователи', icon: '👥' },
  { to: '/admin/brands',   label: 'Бренды',       icon: '🏷' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user || user.role !== 'admin') {
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
        <span className="admin-sidebar-tag" style={{ fontSize: 8 }}>Продакт матрица</span>
      </div>

      {/* Overlay */}
      {sidebarOpen && <div className="admin-sidebar-overlay" onClick={close} />}

      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-logo">
          <img src="/logos/logo-main.png" alt="MATKASYM" />
          <span className="admin-sidebar-tag">Продакт матрица</span>
        </div>

        <nav className="admin-nav">
          {NAV.map(n => (
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
