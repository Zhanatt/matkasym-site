import { Routes, Route, useLocation } from 'react-router-dom';
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
import AdminProductView   from './pages/admin/AdminProductView';
import AdminSets          from './pages/admin/AdminSets';
import AdminFrontmen      from './pages/admin/AdminFrontmen';
import AdminOutOfStock    from './pages/admin/AdminOutOfStock';
import AdminAllCatalog    from './pages/admin/AdminAllCatalog';
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
          <Route path="out-of-stock" element={<AdminOutOfStock />} />
          <Route path="all-catalog"  element={<AdminAllCatalog />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="stock-log" element={<AdminStockLog />} />
          <Route path="changelog" element={<AdminChangelog />} />
        </Route>
      </Routes>
    );
  }

  return (
    <>
      <Header />
      <main>
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
      </main>
      <Footer />
    </>
  );
}
