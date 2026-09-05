import AdminTabsLayout from './AdminTabsLayout';

// Две очереди входящих задач: от клиентов из Telegram-магазина и от своих —
// на разработку техлиста. Работа одна и та же: разобрать и закрыть.
const TABS = [
  { to: '/admin/shop-requests', label: 'Из Telegram' },
  { to: '/admin/tech-requests', label: 'На техлист' },
];

export default function AdminRequestsLayout() {
  return <AdminTabsLayout tabs={TABS} />;
}
