import AdminTabsLayout from './AdminTabsLayout';

// Аудит и его результаты — одна работа: сначала проходят товары, потом смотрят,
// что вышло. Держим их вкладками одного раздела, а не двумя пунктами меню.
//
// Результаты видят не все: их роли уже, чем у самого аудита.
const TABS = [
  { to: '/admin/review',         label: 'Аудит',      end: true },
  { to: '/admin/review/results', label: 'Результаты', roles: ['owner', 'editor', 'designer'] },
  { to: '/admin/review/votes',   label: 'Голоса',     roles: ['owner', 'editor', 'designer'] },
];

export default function AdminReviewLayout() {
  return <AdminTabsLayout tabs={TABS} />;
}
