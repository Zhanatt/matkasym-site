import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { adminGetFrontmen, adminCreateFrontman, adminUpdateFrontman, adminDeleteFrontman } from '../api';

const FrontmenContext = createContext(null);

export function FrontmenProvider({ children }) {
  const [frontmen, setFrontmen] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetFrontmen();
      setFrontmen(res.data || []);
    } catch (e) {
      console.error('Failed to load frontmen:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createFrontman = useCallback(async (data) => {
    const res = await adminCreateFrontman(data);
    await load();
    return res;
  }, [load]);

  const updateFrontman = useCallback(async (id, data) => {
    const res = await adminUpdateFrontman(id, data);
    await load();
    return res;
  }, [load]);

  const deleteFrontman = useCallback(async (id) => {
    await adminDeleteFrontman(id);
    await load();
  }, [load]);

  return (
    <FrontmenContext.Provider value={{
      frontmen,
      loading,
      reload: load,
      createFrontman,
      updateFrontman,
      deleteFrontman,
    }}>
      {children}
    </FrontmenContext.Provider>
  );
}

export const useFrontmen = () => {
  const ctx = useContext(FrontmenContext);
  if (!ctx) {
    throw new Error('useFrontmen must be used within FrontmenProvider');
  }
  return ctx;
};
