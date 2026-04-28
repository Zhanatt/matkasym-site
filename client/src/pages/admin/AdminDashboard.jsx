import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminStats } from '../../api/index';
import { useAuth } from '../../context/AuthContext';

function StatCard({ label, value, sub, red, green, to, icon }) {
  const navigate = useNavigate();
  const style = {
    background: '#fff',
    border: '1px solid var(--gray-200)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    cursor: to ? 'pointer' : 'default',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    transition: 'box-shadow .22s, transform .22s',
    textDecoration: 'none',
    color: 'inherit',
  };

  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <p className="admin-stat-card__label">{label}</p>
        {icon && <span style={{ fontSize: 20, opacity: .5 }}>{icon}</span>}
      </div>
      <p className="admin-stat-card__value" style={red ? { color: 'var(--red)' } : green ? { color: '#2d7a3a' } : {}}>
        {value ?? <span style={{ opacity: .3 }}>—</span>}
      </p>
      {sub && <p style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>{sub}</p>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="admin-stat-card" style={style}>
        {inner}
      </Link>
    );
  }
  return <div className="admin-stat-card" style={style}>{inner}</div>;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    adminStats().then(r => setStats(r.data)).catch(() => {});
  }, []);

  const inStockPct = stats && stats.products > 0
    ? Math.round(((stats.products - stats.outOfStock) / stats.products) * 100)
    : null;

  const isOwner = user?.role === 'owner';
  const canEdit = ['owner', 'editor'].includes(user?.role);

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Дашборд</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            Добро пожаловать, {user?.name}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="admin-stats">
        <StatCard
          label="Всего товаров"
          value={stats?.products}
          sub={inStockPct !== null ? `${inStockPct}% в наличии` : undefined}
          icon="📦"
          to="/admin/products"
        />
        <StatCard
          label="Нет в наличии"
          value={stats?.outOfStock}
          sub={stats?.outOfStock > 0 ? 'Требуют внимания' : 'Всё есть'}
          red={stats?.outOfStock > 0}
          green={stats?.outOfStock === 0}
          icon="⚠️"
          to="/admin/products"
        />
        <StatCard
          label="Бренды"
          value={stats?.brands}
          icon="🏷"
          to={canEdit ? "/admin/brands" : undefined}
        />
        {isOwner && (
          <StatCard
            label="Пользователи"
            value={stats?.users}
            sub={stats?.usersOnline > 0
              ? `● ${stats.usersOnline} онлайн${stats?.pending > 0 ? ` · ${stats.pending} ожидают` : ''}`
              : stats?.pending > 0 ? `${stats.pending} ожидают подтверждения` : 'Нет активных'}
            icon="👥"
            to="/admin/users"
          />
        )}
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--slate)', marginBottom: 12 }}>
          Быстрые действия
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {canEdit && (
            <Link to="/admin/products/new" className="btn btn-primary">
              + Добавить товар
            </Link>
          )}
          <Link to="/admin/products" className="btn btn-outline">
            Все товары
          </Link>
          <Link to="/admin/map" className="btn btn-outline">
            🗺 Product Map
          </Link>
          {isOwner && (
            <Link to="/admin/users" className="btn btn-outline">
              👥 Пользователи
            </Link>
          )}
        </div>
      </div>

      {/* Pending users alert (owner only) */}
      {isOwner && stats?.pending > 0 && (
        <Link to="/admin/users" style={{ textDecoration: 'none' }}>
          <div style={{
            background: '#fffbf0',
            border: '1.5px solid #f0c060',
            borderRadius: 12,
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            transition: 'box-shadow .2s',
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(240,192,96,.3)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <span style={{ fontSize: 24 }}>⏳</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#7a5000' }}>
                {stats.pending} {stats.pending === 1 ? 'пользователь ожидает' : 'пользователей ожидают'} подтверждения
              </div>
              <div style={{ fontSize: 12, color: '#c47a00', marginTop: 2 }}>
                Нажмите чтобы перейти к управлению →
              </div>
            </div>
          </div>
        </Link>
      )}
    </div>
  );
}
