import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminStats } from '../../api/index';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    adminStats().then(r => setStats(r.data)).catch(() => {});
  }, []);

  const cards = stats ? [
    { label: 'Всего товаров',   value: stats.products   },
    { label: 'Нет в наличии',  value: stats.outOfStock, red: true },
    { label: 'Брендов',         value: stats.brands     },
    { label: 'Пользователей',   value: stats.users      },
  ] : [];

  return (
    <div>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Дашборд</h1>
      </div>

      <div className="admin-stats">
        {cards.map(c => (
          <div className="admin-stat-card" key={c.label}>
            <p className="admin-stat-card__label">{c.label}</p>
            <p className="admin-stat-card__value" style={c.red ? { color: 'var(--red)' } : {}}>
              {c.value ?? '—'}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <Link to="/admin/products/new" className="btn btn-primary">+ Добавить товар</Link>
        <Link to="/admin/products" className="btn btn-outline">Все товары</Link>
      </div>
    </div>
  );
}
