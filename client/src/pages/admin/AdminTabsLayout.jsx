import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Вкладки внутри раздела админки. Появились, когда меню стало слишком длинным:
// близкие по смыслу страницы («Каталог по сетам» и «Фронтмены», «Аудит» и его
// результаты) занимали по строке каждая, хотя это одна работа в двух видах.
//
// tabs: [{ to, label, end?, roles? }]. roles — если вкладку видят не все;
// маршрут при этом остаётся доступным, права проверяет сервер.
export default function AdminTabsLayout({ tabs }) {
  const { user } = useAuth();
  const shown = tabs.filter(t => !t.roles || t.roles.includes(user?.role));

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {shown.map(t => (
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
