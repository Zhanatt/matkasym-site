import { Routes, Route, useLocation } from 'react-router-dom';
import Header           from './components/Header';
import Footer           from './components/Footer';
import AdminLayout      from './pages/admin/AdminLayout';
import AdminLogin       from './pages/admin/AdminLogin';
import AdminDashboard   from './pages/admin/AdminDashboard';
import AdminProducts    from './pages/admin/AdminProducts';
import AdminProductForm from './pages/admin/AdminProductForm';
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
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="products/:id" element={<AdminProductForm />} />
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
