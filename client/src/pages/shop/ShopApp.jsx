import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { initTelegram } from './useTelegram';
import ShopCatalog from './ShopCatalog';
import ShopProduct from './ShopProduct';
import ShopRequestForm from './ShopRequestForm';
import ShopMyRequests from './ShopMyRequests';
import './Shop.css';

/**
 * Магазин MATKASYM внутри Telegram (Mini App).
 *
 * Открывается из канала по прямой ссылке t.me/<бот>/<приложение> и живёт на тех же
 * данных, что админка: витрина — товары в наличии по Кыргызстану с розничной ценой.
 * Купить прямо здесь нельзя: клиент оставляет заявку «Уточнить наличие», она уходит
 * сделкой в Битрикс24, дальше с ним говорит менеджер.
 */
export default function ShopApp() {
  useEffect(() => { initTelegram(); }, []);

  return (
    <div className="shop">
      <Routes>
        <Route index element={<ShopCatalog />} />
        <Route path="p/:id" element={<ShopProduct />} />
        <Route path="p/:id/request" element={<ShopRequestForm />} />
        <Route path="my" element={<ShopMyRequests />} />
        <Route path="*" element={<Navigate to="/shop" replace />} />
      </Routes>
    </div>
  );
}
