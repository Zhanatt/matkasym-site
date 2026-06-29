import { Routes, Route, useLocation } from 'react-router-dom';
import { useVersionCheck } from './hooks/useVersionCheck';
import Header           from './components/Header';
import Footer           from './components/Footer';
import AdminLayout        from './pages/admin/AdminLayout';
import AdminLogin         from './pages/admin/AdminLogin';
import AdminResetPassword from './pages/admin/AdminResetPassword';
import AdminDashboard     from './pages/admin/AdminDashboard';
import AdminProductForm   from './pages/admin/AdminProductForm';
import AdminUsers         from './pages/admin/AdminUsers';
import AdminChangelog     from './pages/admin/AdminChangelog';
import AdminStockLog     from './pages/admin/AdminStockLog';
import AdminPriceLog     from './pages/admin/AdminPriceLog';
import AdminPhotoLog     from './pages/admin/AdminPhotoLog';
import AdminSalesChart    from './pages/admin/AdminSalesChart';
import AdminSetSalesChart from './pages/admin/AdminSetSalesChart';
import AdminProductView   from './pages/admin/AdminProductView';
import AdminSets          from './pages/admin/AdminSets';
import AdminFrontmen      from './pages/admin/AdminFrontmen';
import AdminSuppliers     from './pages/admin/AdminSuppliers';
import AdminOutOfStock    from './pages/admin/AdminOutOfStock';
import AdminTenders       from './pages/admin/AdminTenders';
import AdminFeedback      from './pages/admin/AdminFeedback';
import AdminFeedbackForm  from './pages/admin/AdminFeedbackForm';
import AdminFeedbackDetail from './pages/admin/AdminFeedbackDetail';
import AdminAllCatalog    from './pages/admin/AdminAllCatalog';
import AdminProductLog   from './pages/admin/AdminProductLog';
import AdminNews         from './pages/admin/AdminNews';
import AdminNewsCreate   from './pages/admin/AdminNewsCreate';
import AdminProductReview from './pages/admin/AdminProductReview';
import AdminReviewResults from './pages/admin/AdminReviewResults';
import AdminReviewVotes   from './pages/admin/AdminReviewVotes';
import AdminReceiveAlerts from './pages/admin/AdminReceiveAlerts';
import AdminPendingReceive from './pages/admin/AdminPendingReceive';
import Home        from './pages/Home';
import Catalog     from './pages/Catalog';
import ProductPage from './pages/ProductPage';
import Cart        from './pages/Cart';
import Checkout    from './pages/Checkout';
import Login       from './pages/Login';
import Register    from './pages/Register';
import Orders      from './pages/Orders';
import Favorites   from './pages/Favorites';
import Sets        from './pages/Sets';
import Brand       from './pages/Brand';

export default function App() {
  const { pathname } = useLocation();
  useVersionCheck();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return (
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/reset-password/:token" element={<AdminResetPassword />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="products/new" element={<AdminProductForm />} />
          <Route path="products/:id" element={<AdminProductView />} />
          <Route path="products/:id/edit" element={<AdminProductForm />} />
          <Route path="sets" element={<AdminSets />} />
          <Route path="frontmen" element={<AdminFrontmen />} />
          <Route path="suppliers" element={<AdminSuppliers />} />
          <Route path="out-of-stock" element={<AdminOutOfStock />} />
          <Route path="tenders"     element={<AdminTenders />} />
          <Route path="feedback"     element={<AdminFeedback />} />
          <Route path="feedback/new" element={<AdminFeedbackForm />} />
          <Route path="feedback/:id" element={<AdminFeedbackDetail />} />
          <Route path="all-catalog"  element={<AdminAllCatalog />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="stock-log"    element={<AdminStockLog />} />
          <Route path="price-log"    element={<AdminPriceLog />} />
          <Route path="photo-log"    element={<AdminPhotoLog />} />
          <Route path="sales-chart"           element={<AdminSalesChart />} />
          <Route path="sales-chart/:setSlug" element={<AdminSetSalesChart />} />
          <Route path="changelog" element={<AdminChangelog />} />
          <Route path="product-log" element={<AdminProductLog />} />
          <Route path="news" element={<AdminNews />} />
          <Route path="news/create" element={<AdminNewsCreate />} />
          <Route path="review" element={<AdminProductReview />} />
          <Route path="review/results" element={<AdminReviewResults />} />
          <Route path="review/votes" element={<AdminReviewVotes />} />
          <Route path="receive-alerts" element={<AdminReceiveAlerts />} />
          <Route path="pending-receive" element={<AdminPendingReceive />} />
        </Route>
      </Routes>
    );
  }

  return (
    <>
      <Header />
      <main>
        <div key={pathname} className="page-animate">
          <Routes>
            <Route path="/"                element={<Home />} />
            <Route path="/catalog"         element={<Catalog />} />
            <Route path="/product/:id"     element={<ProductPage />} />
            <Route path="/cart"            element={<Cart />} />
            <Route path="/checkout"        element={<Checkout />} />
            <Route path="/login"           element={<Login />} />
            <Route path="/register"        element={<Register />} />
            <Route path="/orders"          element={<Orders />} />
            <Route path="/favorites"       element={<Favorites />} />
            <Route path="/sets"            element={<Sets />} />
            <Route path="/sets/:setKey"    element={<Sets />} />
            <Route path="/brand/:brandKey" element={<Brand />} />
          </Routes>
        </div>
      </main>
      <Footer />
    </>
  );
}
