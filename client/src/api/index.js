import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach token
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Products
export const getProducts = (params) => api.get('/products', { params });
export const getProduct  = (id)     => api.get(`/products/${id}`);
export const getCategories = ()     => api.get('/products/categories');

// Auth
export const register = (data) => api.post('/auth/register', data);
export const login    = (data) => api.post('/auth/login', data);
export const getMe    = ()     => api.get('/auth/me');
export const updateMe = (data) => api.patch('/auth/me', data);
export const toggleFavorite = (id) => api.post(`/auth/favorites/${id}`);

// Brands
export const getBrands = ()      => api.get('/brands');
export const getBrand  = (key)   => api.get(`/brands/${key}`);

// Orders
export const createOrder = (data) => api.post('/orders', data);
export const getMyOrders = ()     => api.get('/orders/my');
export const getOrder    = (id)   => api.get(`/orders/${id}`);

// Admin
export const adminStats      = ()       => api.get('/admin/stats');
export const adminGetProducts= (params) => api.get('/admin/products', { params });
export const adminGetProduct = (id)     => api.get(`/admin/products/${id}`);
export const adminCreateProduct = (data)=> api.post('/admin/products', data);
export const adminUpdateProduct = (id, data) => api.patch(`/admin/products/${id}`, data);
export const adminDeleteProduct = (id)  => api.delete(`/admin/products/${id}`);
export const adminGetBrands   = ()          => api.get('/admin/brands');
export const adminGetFacets   = (params)    => api.get('/admin/products/facets', { params });
export const adminUpdateBrand = (key, data) => api.patch(`/admin/brands/${key}`, data);
export const adminDeleteImage = (url)       => api.delete('/admin/images', { data: { url } });

export default api;
