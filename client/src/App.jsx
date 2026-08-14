import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

// Две независимые части приложения, каждая — свой чанк сборки:
//   /shop  — Telegram Mini App для покупателей из канала (лёгкий, грузится с телефона);
//   всё остальное — Продакт матрица (админка), публичная витрина отключена.
const ShopApp     = lazy(() => import('./pages/shop/ShopApp'));
const AdminRoutes = lazy(() => import('./AdminRoutes'));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/shop/*" element={<ShopApp />} />
        <Route path="/*"      element={<AdminRoutes />} />
      </Routes>
    </Suspense>
  );
}
