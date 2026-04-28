import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getMe, heartbeat } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const hbRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    getMe()
      .then(r => setUser(r.data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  // Heartbeat every 60s when logged in
  useEffect(() => {
    if (!user) { clearInterval(hbRef.current); return; }
    heartbeat().catch(() => {});
    hbRef.current = setInterval(() => heartbeat().catch(() => {}), 60_000);
    return () => clearInterval(hbRef.current);
  }, [!!user]);

  const saveLogin = (token, userData) => {
    localStorage.setItem('token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, saveLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
