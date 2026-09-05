import AdminTabsLayout from './AdminTabsLayout';

// Поступления и поставщики — про один и тот же приход товара: что едет и от кого.
//
// Роли у вкладок разные: поступления открыты всем, кто пущен в админку (склад
// принимает, закупщик заказывает), а поставщики — более узкому кругу. Поэтому
// пункт меню ведёт на поступления: туда попадают все, кто его видит.
const TABS = [
  { to: '/admin/pending-receive', label: 'Поступления' },
  { to: '/admin/suppliers',       label: 'Поставщики',
    roles: ['owner', 'navigator', 'warehouse', 'designer'] },
];

export default function AdminSupplyLayout() {
  return <AdminTabsLayout tabs={TABS} />;
}
