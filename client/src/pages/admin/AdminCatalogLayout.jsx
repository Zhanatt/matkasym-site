import AdminTabsLayout from './AdminTabsLayout';

// Всё про каталог товаров в одном разделе: сами сеты, закреплённые за ними люди,
// плоский список всех карточек и подготовка номенклатуры для 1С.
//
// «Весь каталог» и «Номенклатура» раньше в меню не стояли: на первую вели
// ссылки из других экранов, на вторую — отдельный пункт. Обе про тот же
// каталог, поэтому живут тут.
const TABS = [
  { to: '/admin/sets',          label: 'Сеты', end: true },
  { to: '/admin/sets/frontmen', label: 'Фронтмены и дизайнеры' },
  { to: '/admin/all-catalog',   label: 'Весь каталог' },
  { to: '/admin/nomenclature',  label: 'Номенклатура для 1С',
    roles: ['owner', 'editor', 'viewer'] },
];

export default function AdminCatalogLayout() {
  return <AdminTabsLayout tabs={TABS} />;
}
