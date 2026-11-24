import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

// Две независимые части приложения, каждая — свой чанк сборки:
//   /shop  — Telegram Mini App для покупателей из канала (лёгкий, грузится с телефона);
//   всё остальное — Продакт матрица (админка), публичная витрина отключена.
const ShopApp     = lazy(() => import('./pages/shop/ShopApp'));
const AdminRoutes = lazy(() => import('./AdminRoutes'));
// /techlist — публичная заявка на техлист для менеджеров по продажам (без входа)
const TechlistForm = lazy(() => import('./pages/techlist/TechlistForm'));
// /techlist/rework/:taskId — клиент просит изменить техлист: назад в «Заявку на техлист» с комментарием
const TechlistRework = lazy(() => import('./pages/techlist/TechlistRework'));

// Плашка на предпросмотре «Правок сайта»: там боевая база, менять данные нельзя
function PreviewBanner() {
  if (typeof __IS_PREVIEW__ === 'undefined' || !__IS_PREVIEW__) return null;
  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 12, transform: 'translateX(-50%)', zIndex: 10000,
      background: '#1c1c1c', color: '#fff', borderRadius: 999, padding: '7px 16px', fontSize: 13,
      fontFamily: 'system-ui, sans-serif', boxShadow: '0 6px 20px rgba(0,0,0,.25)', pointerEvents: 'none',
    }}>👀 Предпросмотр правки · данные настоящие — только смотрите</div>
  );
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <PreviewBanner />
      <Routes>
        <Route path="/shop/*" element={<ShopApp />} />
        <Route path="/techlist" element={<TechlistForm />} />
        <Route path="/techlist/rework/:taskId" element={<TechlistRework />} />
        <Route path="/*"      element={<AdminRoutes />} />
      </Routes>
    </Suspense>
  );
}
