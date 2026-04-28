import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resetPassword as apiReset } from '../../api/index';
import './AdminLogin.css';

export default function AdminResetPassword() {
  const { token } = useParams();
  const navigate  = useNavigate();
  const [password, setPassword]   = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== password2) return setError('Пароли не совпадают');
    setLoading(true); setError('');
    try {
      const res = await apiReset(token, { password });
      setSuccess(res.data.message);
      setTimeout(() => navigate('/admin/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка сброса пароля');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <img src="/logos/logo-main.png" alt="MATKASYM" className="admin-login-logo" />
          <span className="admin-login-tag">Продакт матрица</span>
        </div>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <p className="admin-login-hint">Введите новый пароль для вашего аккаунта.</p>
          <div className="admin-login-field">
            <label>Новый пароль</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              autoFocus
            />
          </div>
          <div className="admin-login-field">
            <label>Повторите пароль</label>
            <input
              type="password"
              required
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              placeholder="Повторите пароль"
            />
          </div>
          {error   && <p className="admin-login-error">{error}</p>}
          {success && <p className="admin-login-success">{success}</p>}
          <button type="submit" className="admin-login-btn" disabled={loading || !!success}>
            {loading ? 'Сохранение...' : 'Сохранить пароль'}
          </button>
        </form>
      </div>
    </div>
  );
}
