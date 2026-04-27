import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

export default function Register() {
  const [form,  setForm]  = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { saveLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const r = await register(form);
      saveLogin(r.data.token, r.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Регистрация</h1>

        <div className="form-group">
          <label>Имя</label>
          <input value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ваше имя" required />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="your@email.com" required />
        </div>
        <div className="form-group">
          <label>Телефон</label>
          <input value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="+7 700 000 00 00" />
        </div>
        <div className="form-group">
          <label>Пароль</label>
          <input type="password" value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Минимум 6 символов" required />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary btn-full" disabled={loading}>
          {loading ? 'Регистрация...' : 'Создать аккаунт'}
        </button>

        <p className="auth-link">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
      </form>
    </div>
  );
}
