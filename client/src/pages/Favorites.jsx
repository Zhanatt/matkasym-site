import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMe, getProduct } from '../api';
import { useAuth } from '../context/AuthContext';
import ProductCard from '../components/ProductCard';

export default function Favorites() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user?.favorites?.length) { setLoading(false); return; }
    Promise.all(user.favorites.map(id => getProduct(id).then(r => r.data)))
      .then(setProducts)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return (
    <div className="container">
      <div className="empty-state" style={{ marginTop: 40 }}>
        <h2>Войдите, чтобы видеть избранное</h2>
        <Link to="/login" className="btn btn-primary" style={{ marginTop: 20 }}>Войти</Link>
      </div>
    </div>
  );

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  return (
    <div className="container" style={{ paddingBottom: 64 }}>
      <h1 className="page-title">Избранное</h1>
      {!products.length ? (
        <div className="empty-state">
          <h2>Список пуст</h2>
          <p>Добавляйте товары в избранное на страницах товаров</p>
          <Link to="/catalog" className="btn btn-primary" style={{ marginTop: 20 }}>В каталог</Link>
        </div>
      ) : (
        <div className="product-grid">
          {products.map(p => <ProductCard key={p._id} product={p} />)}
        </div>
      )}
    </div>
  );
}
