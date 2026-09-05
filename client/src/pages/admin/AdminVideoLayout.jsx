import AdminTabsLayout from './AdminTabsLayout';

// Планирование съёмок и отчёт по ним — одна работа: сначала ставят план
// фронтмену, потом смотрят, что снято. Отчёт видят не все.
const TABS = [
  { to: '/admin/video-schedule', label: 'Планирование' },
  { to: '/admin/video-report',   label: 'Отчёт по видео', roles: ['owner', 'editor', 'designer'] },
];

export default function AdminVideoLayout() {
  return <AdminTabsLayout tabs={TABS} />;
}
