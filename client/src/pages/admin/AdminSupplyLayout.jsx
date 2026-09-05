import AdminTabsLayout from './AdminTabsLayout';

// Склад целиком: что едет, от кого, чего не хватает и сколько должно лежать.
//
// Права у вкладок разные. Поступления открыты всем, кто пущен в админку —
// склад принимает, закупщик заказывает. Буфер и поставщики уже. Поэтому пункт
// меню ведёт на поступления: иначе закупщик, нажав его, попал бы на закрытую
// для себя страницу.
const TABS = [
  { to: '/admin/pending-receive', label: 'Поступления' },
  { to: '/admin/receive-alerts',  label: 'Оповещения о приёмке' },
  { to: '/admin/out-of-stock',    label: 'Нет в наличии' },
  { to: '/admin/buffer-stock',    label: 'Буферный запас',
    roles: ['owner', 'editor', 'designer'] },
  { to: '/admin/suppliers',       label: 'Поставщики',
    roles: ['owner', 'navigator', 'warehouse', 'designer'] },
];

export default function AdminSupplyLayout() {
  return <AdminTabsLayout tabs={TABS} />;
}
