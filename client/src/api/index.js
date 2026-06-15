import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

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
export const register       = (data) => api.post('/auth/register', data);
export const login          = (data) => api.post('/auth/login', data);
export const forgotPassword = (data) => api.post('/auth/forgot-password', data);
export const resetPassword  = (token, data) => api.post(`/auth/reset-password/${token}`, data);
export const getMe        = ()     => api.get('/auth/me');
export const heartbeat    = ()     => api.post('/auth/heartbeat');
export const logoutApi    = ()     => api.post('/auth/logout');
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
export const adminUpdateBrand    = (key, data)        => api.patch(`/admin/brands/${key}`, data);
export const adminAddBrandSet    = (key, slug, label)  => api.post(`/admin/brands/${key}/sets`, { slug, label });
export const adminUpdateBrandSet = (key, slug, data)   => api.put(`/admin/brands/${key}/sets/${slug}`, data);
export const adminDeleteBrandSet = (key, slug)         => api.delete(`/admin/brands/${key}/sets/${slug}`);
export const adminReorderBrandSets = (key, orderedKeys) => api.put(`/admin/brands/${key}/sets-reorder`, { orderedKeys });
export const adminGetUsers    = ()       => api.get('/admin/users');
export const adminUpdateUser  = (id, data) => api.patch(`/admin/users/${id}`, data);
export const adminDeleteUser  = (id)    => api.delete(`/admin/users/${id}`);
export const adminDeleteImage = (url)       => api.delete('/admin/images', { data: { url } });
export const adminGetCustomCategories  = ()          => api.get('/admin/custom-categories');
export const adminCreateCustomCategory = (data)      => api.post('/admin/custom-categories', data);
export const adminGetCategorySpecs    = (cat)       => api.get(`/admin/category-specs/${cat}`);
export const adminSaveCategorySpec    = (cat, data) => api.post(`/admin/category-specs/${cat}`, data);
export const adminDeleteCategorySpec  = (cat, key)  => api.delete(`/admin/category-specs/${cat}/${encodeURIComponent(key)}`);
export const adminGetChangelog  = (params) => api.get('/admin/changelog',  { params });
export const adminGetStockLog   = (params) => api.get('/admin/stock-log',  { params });
export const adminGetPriceLog   = (params) => api.get('/admin/price-log',  { params });
export const adminGetPhotoLog   = (params) => api.get('/admin/photo-log',  { params });
export const adminGetSalesChart      = (params) => api.get('/admin/sales-chart', { params });
export const adminGetSalesChartSet   = (set, params) => api.get('/admin/sales-chart', { params: { ...params, set, groupBy: 'product' } });
export const adminGetFrontmen    = (brand)      => api.get('/admin/frontmen', { params: brand ? { brand } : {} });
export const adminCreateFrontman = (data)       => api.post('/admin/frontmen', data);
export const adminUpdateFrontman = (id, data)   => api.patch(`/admin/frontmen/${id}`, data);
export const adminDeleteFrontman = (id)         => api.delete(`/admin/frontmen/${id}`);
export const adminGetTenders      = (params)     => api.get('/admin/tenders', { params });
export const adminAssignTender    = (id, userId) => api.patch(`/admin/tenders/${id}/assign`, { userId });
export const adminCompleteTender  = (id)         => api.patch(`/admin/tenders/${id}/complete`);
export const adminCatalogPdf    = (data)        => api.post('/admin/pdf/catalog', data, { responseType: 'blob' });
export const adminTZPdf         = (id, type)    => api.get(`/admin/pdf/tz/${id}/${type}`, { responseType: 'blob' });
export const adminUploadPrices  = (file, type, onProgress)  => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/admin/upload-prices?type=${type}`, fd, {
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  });
};
export const adminUploadStock   = (file, onProgress)        => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/admin/upload-stock', fd, {
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  });
};
export const adminUploadPhotos  = (files, onProgress, sourceFile = '')       => {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  if (sourceFile) fd.append('sourceFile', sourceFile);
  return api.post('/admin/upload-photos', fd, {
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  });
};

export const adminPreviewNomenclature = (file, onProgress) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/admin/preview-nomenclature', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  });
};

export const adminConfirmNomenclature = (items) =>
  api.post('/admin/confirm-nomenclature', { items });

export const adminGetProductLog = (params) => api.get('/admin/product-log', { params });

// Upload single image (for news etc.)
export const adminUploadImage = (formData) =>
  api.post('/admin/upload-image', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

// News feed
export const adminGetNews          = (params)     => api.get('/admin/news', { params });
export const adminGetNewsUnread    = ()            => api.get('/admin/news/unread-count');
export const adminCreateNews       = (data)        => api.post('/admin/news', data);
export const adminMarkNewsRead     = (id)          => api.patch(`/admin/news/${id}/read`);
export const adminMarkAllNewsRead  = ()            => api.post('/admin/news/read-all');
export const adminDeleteNews       = (id)          => api.delete(`/admin/news/${id}`);
export const adminSyncNewsProduct  = (id)          => api.post(`/admin/news/${id}/sync`);

// Telegram
export const adminGetTelegramLink  = ()            => api.get('/admin/telegram-link');
export const adminUnlinkTelegram   = ()            => api.delete('/admin/telegram-unlink');

// Suppliers
export const adminGetSuppliers     = ()            => api.get('/admin/suppliers');
export const adminCreateSupplier   = (data)        => api.post('/admin/suppliers', data);
export const adminUpdateSupplier   = (id, data)    => api.patch(`/admin/suppliers/${id}`, data);
export const adminDeleteSupplier   = (id)          => api.delete(`/admin/suppliers/${id}`);

// Warehouse (склад) — приём товара
export const adminGetInTransit     = ()            => api.get('/admin/products/in-transit');
export const adminReceiveProduct   = (id, data)    => api.post(`/admin/products/${id}/receive`, data);
export const adminAddStock         = (id, data)    => api.post(`/admin/products/${id}/add-stock`, data);

// Receive Alerts (уведомления о приёме)
export const adminGetReceiveAlerts      = (status) => api.get('/admin/receive-alerts', { params: { status } });
export const adminGetReceiveAlertsCount = ()       => api.get('/admin/receive-alerts/count');
export const adminUpdateReceiveAlert    = (id, data) => api.put(`/admin/receive-alerts/${id}`, data);

// Audits Management
export const adminGetAudits           = ()               => api.get('/admin/audits');
export const adminGetActiveAudit      = ()               => api.get('/admin/audits/active');
export const adminGetAudit            = (id)             => api.get(`/admin/audits/${id}`);
export const adminCreateAudit         = (data)           => api.post('/admin/audits', data);
export const adminCompleteAudit       = (id)             => api.post(`/admin/audits/${id}/complete`);
export const adminDeleteAudit         = (id)             => api.delete(`/admin/audits/${id}`);

// Product Review (Аудит ассортимента)
export const adminGetMySets           = ()               => api.get('/admin/review/my-sets');
export const adminGetAllSetProducts   = (setSlug, auditId) => api.get(`/admin/review/set/${setSlug}/all`, { params: { auditId } });
export const adminSubmitReview        = (data)           => api.post('/admin/review', data);
export const adminGetReviewResults    = (params)         => api.get('/admin/review/results', { params });
export const adminGetReviewStats      = (auditId)        => api.get('/admin/review/stats', { params: { auditId } });
export const adminGetReviewGrouped    = (params)         => api.get('/admin/review/grouped', { params });
export const adminGetFrontmenProgress = (auditId)        => api.get('/admin/review/frontmen-progress', { params: { auditId } });
export const adminDeleteReview        = (id)             => api.delete(`/admin/review/${id}`);

export default api;
