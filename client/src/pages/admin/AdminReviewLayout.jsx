import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Аудит и его результаты были двумя пунктами меню, хотя это одна работа: сначала
// проходят товары, потом смотрят, что получилось. Теперь один пункт и вкладки —
// не надо возвращаться в меню, чтобы попасть из проверки в свод.
//
// Результаты видят не все: их роли уже, чем у самого аудита, — вкладка просто
// не показывается остальным (маршрут при этом остаётся, права проверяет сервер).
const RESULT_ROLES = ['owner', 'editor', 'designer'];

const TABS = [
  { to: '/admin/review',         label: 'Аудит',       end: true },
  { to: '/admin/review/results', label: 'Результаты',  roles: RESULT_ROLES },
];

export default function AdminReviewLayout() {
  const { user } = useAuth();
  const tabs = TABS.filter(t => !t.roles || t.roles.includes(user?.role));

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} end={t.end}
            style={({ isActive }) => ({
              padding: '7px 16px', borderRadius: 10, textDecoration: 'none',
              fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
              border: `1.5px solid ${isActive ? '#3463A3' : '#e0e0e0'}`,
              background: isActive ? '#eef2f7' : '#fff',
              color: isActive ? '#3463A3' : '#555',
            })}>
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </>
  );
}
