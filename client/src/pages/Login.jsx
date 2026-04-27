import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

export default function Login() {
  const [form,  setForm]  = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { saveLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const r = await login(form);
      saveLogin(r.data.token, r.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Войти</h1>

        <div className="form-group">
          <label>Email</label>
          <input type="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="your@email.com" required />
        </div>
        <div className="form-group">
          <label>Пароль</label>
          <input type="password" value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="••••••" required />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary btn-full" disabled={loading}>
          {loading ? 'Входим...' : 'Войти'}
        </button>

        <p className="auth-link">Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>
      </form>
    </div>
  );
}
