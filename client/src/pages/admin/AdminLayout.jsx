import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FrontmenProvider } from '../../context/FrontmenContext';
import { adminStats, adminGetNewsUnread, adminGetTelegramLink, adminUnlinkTelegram, adminGetReceiveAlertsCount, adminGetPendingReceiveCount } from '../../api';
import './Admin.css';

const NAV_ALL = [
  { to: '/admin',          label: 'Дашборд',             icon: '◻', end: true, roles: ['owner','editor','viewer','navigator','warehouse'] },
  { to: '/admin/sets',     label: 'Каталог по сетам',    icon: '🗂', roles: ['owner','editor','viewer','navigator'] },
  { to: '/admin/pending-receive', label: 'Приём товара', icon: '📦', roles: ['warehouse'], badge: 'pending_receive' },
  { to: '/admin/frontmen', label: 'Фронтмены',           icon: '👤', roles: ['owner','editor','viewer','navigator'] },
  { to: '/admin/suppliers',label: 'Поставщики',          icon: '🤝', roles: ['owner','navigator','warehouse'] },
  { to: '/admin/news',     label: 'Новости',             icon: '📢', roles: ['owner','editor','viewer','navigator','warehouse'], badge: 'news' },
  { to: '/admin/review',   label: 'Аудит товаров',       icon: '✅', roles: ['owner','editor','viewer','navigator'] },
  { to: '/admin/review/results', label: 'Результаты аудита', icon: '📊', roles: ['owner','editor'] },
  { to: '/admin/users',     label: 'Пользователи',       icon: '👥', roles: ['owner', 'editor', 'viewer'], badge: 'pending' },
  { to: '/admin/tenders',      label: 'Тендеры',            icon: '🎯', roles: ['owner','editor','viewer','navigator'] },
  { to: '/admin/receive-alerts', label: 'Уведомления приёма', icon: '🚨', roles: ['owner','editor'], badge: 'alerts' },
  { to: '/admin/stock-log',   label: 'История остатков',  icon: '📦', roles: ['owner','editor','warehouse'] },
  { to: '/admin/price-log',   label: 'История цен',       icon: '💰', roles: ['owner','editor'] },
  { to: '/admin/photo-log',   label: 'История фото',      icon: '🖼', roles: ['owner','editor'] },
  { to: '/admin/sales-chart', label: 'Продажи по сетам',  icon: '📈', roles: ['owner','editor'] },
  { to: '/admin/changelog',   label: 'История изменений', icon: '📋', roles: ['owner'] },
  { to: '/admin/product-log', label: 'История товаров',   icon: '🗃', roles: ['owner','editor'] },
];

export default function AdminLayout() {
  const { user, logout, loading, authError, checkAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [newsUnread,   setNewsUnread]   = useState(0);
  const [alertsCount,  setAlertsCount]  = useState(0);
  const [pendingReceiveCount, setPendingReceiveCount] = useState(0);
  const [tgLink,       setTgLink]       = useState('');
  const [tgConnected,  setTgConnected]  = useState(false);
  const [tgBannerDismissed, setTgBannerDismissed] = useState(
    () => !!localStorage.getItem('tg_banner_dismissed')
  );
  const tgPollRef = useRef(null);

  // Reset body overflow on every navigation (guard against modal scroll-lock leaking)
  useEffect(() => {
    document.body.style.overflow = '';
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    const load = () => {
      adminStats().then(r => setPendingCount(r.data.pending || 0)).catch(() => {});
      adminGetNewsUnread().then(r => setNewsUnread(r.data.count || 0)).catch(() => {});
      adminGetReceiveAlertsCount().then(r => setAlertsCount(r.data.count || 0)).catch(() => {});
      adminGetPendingReceiveCount().then(r => setPendingReceiveCount(r.data.count || 0)).catch(() => {});
    };
    load();
    adminGetTelegramLink().then(r => { setTgLink(r.data.link); setTgConnected(r.data.connected); }).catch(() => {});
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [!!user]);

  const startTgPolling = () => {
    if (tgPollRef.current) return;
    let attempts = 0;
    tgPollRef.current = setInterval(() => {
      attempts++;
      adminGetTelegramLink()
        .then(r => {
          if (r.data.connected) {
            setTgConnected(true);
            clearInterval(tgPollRef.current);
            tgPollRef.current = null;
          }
        })
        .catch(() => {});
      if (attempts >= 40) { // stop after ~2 min
        clearInterval(tgPollRef.current);
        tgPollRef.current = null;
      }
    }, 3000);
  };

  // Clear news badge when visiting /admin/news
  useEffect(() => {
    if (location.pathname === '/admin/news') setNewsUnread(0);
  }, [location.pathname]);

  const ALLOWED = ['owner', 'editor', 'viewer', 'navigator', 'warehouse'];

  // Waiting for AuthContext to verify token
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--admin-canvas)', fontFamily: 'var(--admin-font)' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e8e6e0', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // Network/server error — show retry instead of redirecting to login
  if (authError) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--admin-canvas)', fontFamily: 'var(--admin-font)' }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <p style={{ fontSize: 15, color: 'var(--dark)', margin: 0 }}>Сервер не отвечает. Повторите попытку.</p>
      <button
        onClick={checkAuth}
        style={{ padding: '10px 28px', borderRadius: 8, background: 'var(--black)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
      >Повторить</button>
    </div>
  );

  if (!user || !ALLOWED.includes(user.role)) {
    return <Navigate to="/admin/login" replace />;
  }

  const close = () => setSidebarOpen(false);

  return (
    <FrontmenProvider>
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
          {NAV_ALL.filter(n => n.roles.includes(user.role)).map(n => {
            const badgeCount = n.badge === 'pending' ? pendingCount : n.badge === 'news' ? newsUnread : n.badge === 'alerts' ? alertsCount : n.badge === 'pending_receive' ? pendingReceiveCount : 0;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
                onClick={close}
              >
                <span className="admin-nav-icon">{n.icon}</span>
                {n.label}
                {badgeCount > 0 && (
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
                    {badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          {/* Telegram */}
          {tgConnected ? (
            <button
              onClick={() => { adminUnlinkTelegram().then(() => setTgConnected(false)).catch(() => {}); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 12,
                padding: '8px 12px', borderRadius: 8, border: 'none',
                background: '#e8f8f0', color: '#27ae60', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 18 }}>✓</span> Telegram подключён
            </button>
          ) : tgLink && (
            <a
              href={tgLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={startTgPolling}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 12,
                padding: '8px 12px', borderRadius: 8, textDecoration: 'none',
                background: '#e3f2fd', color: '#1976d2', fontSize: 13, fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 18 }}>📱</span> Подключить Telegram
            </a>
          )}
          <span className="admin-user-name">{user.name}</span>
          <button className="admin-logout" onClick={() => { logout(); navigate('/'); }}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {/* Telegram connect banner */}
        {!tgConnected && tgLink && !tgBannerDismissed && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            background: '#e3f2fd', borderBottom: '1px solid #90caf9',
            padding: '10px 20px', fontSize: 13,
          }}>
            <span style={{ fontSize: 20 }}>📱</span>
            <span style={{ flex: 1, color: '#1565c0', fontWeight: 600 }}>
              Подключите Telegram — и вы будете получать уведомления о новостях Matkasym прямо в мессенджер
            </span>
            <a
              href={tgLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={startTgPolling}
              style={{
                background: '#1976d2', color: '#fff', padding: '7px 16px',
                borderRadius: 7, fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              Подключить →
            </a>
            <button
              onClick={() => { localStorage.setItem('tg_banner_dismissed', '1'); setTgBannerDismissed(true); }}
              style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#888', padding: '0 4px', lineHeight: 1 }}
              title="Закрыть"
            >×</button>
          </div>
        )}

        <div key={location.pathname} className="admin-page">
          <Outlet />
        </div>
      </main>
    </div>
    </FrontmenProvider>
  );
}
