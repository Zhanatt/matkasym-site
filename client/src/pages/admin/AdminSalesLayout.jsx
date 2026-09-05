import AdminTabsLayout from './AdminTabsLayout';

// Два разреза одних и тех же продаж: по сетам и по агентам.
const TABS = [
  { to: '/admin/sales-chart', label: 'По сетам' },
  { to: '/admin/agent-sales', label: 'По агентам' },
];

export default function AdminSalesLayout() {
  return <AdminTabsLayout tabs={TABS} />;
}
