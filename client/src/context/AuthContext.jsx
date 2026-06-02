import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('arsch_token');
    const savedUser = localStorage.getItem('arsch_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch { clearAuth(); }
    }
    setLoading(false);
  }, []);

  function login(userData, tokenValue) {
    setUser(userData);
    setToken(tokenValue);
    localStorage.setItem('arsch_token', tokenValue);
    localStorage.setItem('arsch_user', JSON.stringify(userData));
  }

  function clearAuth() {
    setUser(null);
    setToken(null);
    localStorage.removeItem('arsch_token');
    localStorage.removeItem('arsch_user');
  }

  function updateUser(updates) {
    const updated = { ...user, ...updates };
    setUser(updated);
    localStorage.setItem('arsch_user', JSON.stringify(updated));
  }

  const apiCall = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout: clearAuth, updateUser, apiCall }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
