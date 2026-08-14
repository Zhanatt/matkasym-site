import axios from 'axios';
import { initData } from './useTelegram';

// Отдельный клиент, а не общий src/api/index.js: у магазина нет JWT и нет cookie —
// клиент опознаётся подписью Telegram, и она уходит с каждым запросом.
const api = axios.create({ baseURL: '/api/shop' });

api.interceptors.request.use(cfg => {
  const data = initData();
  if (data) cfg.headers['X-Telegram-Init-Data'] = data;
  return cfg;
});

export const shopFilters  = ()       => api.get('/filters').then(r => r.data);
export const shopProducts = (params) => api.get('/products', { params }).then(r => r.data);
export const shopProduct  = (id)     => api.get(`/products/${id}`).then(r => r.data);
export const shopRequest  = (data)   => api.post('/requests', data).then(r => r.data);
export const shopMyRequests = ()     => api.get('/requests/my').then(r => r.data);
