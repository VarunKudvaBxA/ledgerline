import { createContext, useContext, useEffect, useState } from 'react';
import { api, refresh, setToken } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, try to restore the session from the refresh cookie.
  useEffect(() => {
    refresh().then((u) => setUser(u)).finally(() => setLoading(false));
  }, []);

  const start = (data) => { setToken(data.accessToken); setUser(data.user); };

  const value = {
    user,
    loading,
    login: async (email, password) => start(await api('/auth/login', { method: 'POST', body: { email, password } })),
    register: async (email, password) => start(await api('/auth/register', { method: 'POST', body: { email, password } })),
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      setToken(null);
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
