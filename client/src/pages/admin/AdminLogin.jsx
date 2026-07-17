import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { login as apiLogin, register as apiRegister, forgotPassword as apiForgot } from '../../api/index';
import { canEnterAdmin } from '../../constants/roles';
import './AdminLogin.css';

export default function AdminLogin() {
  const { saveLogin } = useAuth();
  const navigate  = useNavigate();
  const [tab, setTab]         = useState('login'); // 'login' | 'register' | 'forgot'
  const [form, setForm]       = useState({ name: '', email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const switchTab = (t) => { setTab(t); setError(''); setSuccess(''); };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await apiLogin({ email: form.email.trim().toLowerCase(), password: form.password });
      const role = res.data.user.role;
      if (role === 'banned')
        return setError('Ваш доступ к Продакт матрице запрещён.');
      if (!canEnterAdmin(role))
        return setError('У вас нет доступа к Продакт матрице.');
      saveLogin(res.data.token, res.data.user);
      navigate('/admin');
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await apiForgot({ email: form.email.trim().toLowerCase() });
      setSuccess(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка отправки');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      await apiRegister({ name: form.name, email: form.email.trim().toLowerCase(), password: form.password });
      setSuccess('Запрос отправлен! Ожидайте письма с подтверждением от администратора.');
      setTab('login');
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        {/* Header */}
        <div className="admin-login-header">
          <img src="/logos/logo-main.png" alt="MATKASYM" className="admin-login-logo" />
          <span className="admin-login-tag">Продакт матрица</span>
        </div>

        {/* Tabs */}
        <div className="admin-login-tabs">
          <button
            className={`admin-login-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
          >
            Войти
          </button>
          <button
            className={`admin-login-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => switchTab('register')}
          >
            Запросить доступ
          </button>
        </div>

        {/* Login form */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="admin-login-form">
            <div className="admin-login-field">
              <label>Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="your@email.com"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div className="admin-login-field">
              <label>Пароль</label>
              <div className="admin-login-password-wrap">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="admin-login-eye"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                  aria-label={showPass ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            {error && <p className="admin-login-error">{error}</p>}
            {error && (
              <button
                type="button"
                className="admin-login-forgot-link"
                onClick={() => switchTab('forgot')}
              >
                Забыли пароль?
              </button>
            )}
            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        )}

        {/* Forgot password form */}
        {tab === 'forgot' && (
          <form onSubmit={handleForgot} className="admin-login-form">
            <p className="admin-login-hint">
              Введите email — мы отправим ссылку для сброса пароля (действует 1 час).
            </p>
            <div className="admin-login-field">
              <label>Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="your@email.com"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            {error   && <p className="admin-login-error">{error}</p>}
            {success && <p className="admin-login-success">{success}</p>}
            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? 'Отправка...' : 'Отправить письмо'}
            </button>
            <button type="button" className="admin-login-forgot-link" onClick={() => switchTab('login')}>
              ← Вернуться ко входу
            </button>
          </form>
        )}

        {/* Register form */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="admin-login-form">
            <p className="admin-login-hint">
              Заполните форму — администратор получит письмо и подтвердит ваш доступ.
            </p>
            <div className="admin-login-field">
              <label>Имя</label>
              <input
                required
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Ваше имя"
                autoFocus
              />
            </div>
            <div className="admin-login-field">
              <label>Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            <div className="admin-login-field">
              <label>Пароль</label>
              <div className="admin-login-password-wrap">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Минимум 6 символов"
                />
                <button
                  type="button"
                  className="admin-login-eye"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            {error   && <p className="admin-login-error">{error}</p>}
            {success && <p className="admin-login-success">{success}</p>}
            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? 'Отправка...' : 'Запросить доступ'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
