import AdminTabsLayout from './AdminTabsLayout';

// Сеты и закреплённые за ними люди — один раздел: фронтмена и дизайнера
// назначают на сет, и смотреть их отдельным пунктом меню незачем.
const TABS = [
  { to: '/admin/sets',          label: 'Сеты', end: true },
  { to: '/admin/sets/frontmen', label: 'Фронтмены и дизайнеры' },
];

export default function AdminCatalogLayout() {
  return <AdminTabsLayout tabs={TABS} />;
}
