/**
 * SentinelPharma Auth Context
 * ========================
 * Authentication state management.
 */

import React, { createContext, useState, useCallback, useEffect, useMemo, useContext } from 'react';
import { authService, AUTH_EXPIRED_EVENT } from '../services/api';

const AUTH_STORAGE_KEY = 'sentinel_auth_session';
const AUTH_STORAGE_MODE_KEY = 'sentinel_auth_storage_mode';

const getPreferredStorage = () => {
  const mode = localStorage.getItem(AUTH_STORAGE_MODE_KEY);
  return mode === 'session' ? sessionStorage : localStorage;
};

const readPersistedSession = () => {
  const local = localStorage.getItem(AUTH_STORAGE_KEY);
  if (local) {
    localStorage.setItem(AUTH_STORAGE_MODE_KEY, 'local');
    return { raw: local, storage: localStorage };
  }

  const session = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (session) {
    localStorage.setItem(AUTH_STORAGE_MODE_KEY, 'session');
    return { raw: session, storage: sessionStorage };
  }

  return { raw: null, storage: getPreferredStorage() };
};

const clearStoredSession = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AUTH_STORAGE_MODE_KEY);
};

export const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const { raw: stored, storage } = readPersistedSession();
        if (!stored) {
          return;
        }

        const parsed = JSON.parse(stored);
        if (!parsed?.token) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          return;
        }

        const meResponse = await authService.me();
        if (!isMounted) return;

        const serverUser = meResponse?.data?.user;
        if (serverUser?.id) {
          setUser(serverUser);
          setIsAuthenticated(true);
          storage.setItem(
            AUTH_STORAGE_KEY,
            JSON.stringify({
              token: parsed.token,
              user: serverUser,
              loginAt: parsed.loginAt || new Date().toISOString()
            })
          );
        }
      } catch (_err) {
        clearStoredSession();
        if (isMounted) {
          setUser(null);
          setIsAuthenticated(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Login user
   */
  const login = useCallback(async (credentials) => {
    const email = String(credentials?.email || '').trim().toLowerCase();
    const password = String(credentials?.password || '').trim();
    const name = String(credentials?.name || '').trim();
    const role = String(credentials?.role || 'researcher').trim() || 'researcher';
    const organization = String(credentials?.organization || '').trim();
    const rememberMe = credentials?.rememberMe !== false;

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    setIsLoading(true);
    try {
      const response = await authService.login({
        email,
        password,
        name,
        role,
        organization
      });

      const token = response?.data?.token;
      const sessionUser = response?.data?.user;

      if (!token || !sessionUser?.id) {
        throw new Error('Authentication service returned incomplete response');
      }

      const targetStorage = rememberMe ? localStorage : sessionStorage;
      const resetStorage = rememberMe ? sessionStorage : localStorage;
      resetStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.setItem(AUTH_STORAGE_MODE_KEY, rememberMe ? 'local' : 'session');

      targetStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          token,
          user: sessionUser,
          loginAt: new Date().toISOString()
        })
      );

      setUser(sessionUser);
      setIsAuthenticated(true);
      return sessionUser;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const googleLogin = useCallback(async ({ credential, role = 'researcher', rememberMe = true } = {}) => {
    if (!credential) {
      throw new Error('Google credential is required');
    }

    setIsLoading(true);
    try {
      const response = await authService.googleLogin({ credential, role });
      const token = response?.data?.token;
      const sessionUser = response?.data?.user;

      if (!token || !sessionUser?.id) {
        throw new Error('Google authentication returned incomplete response');
      }

      const targetStorage = rememberMe ? localStorage : sessionStorage;
      const resetStorage = rememberMe ? sessionStorage : localStorage;
      resetStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.setItem(AUTH_STORAGE_MODE_KEY, rememberMe ? 'local' : 'session');

      targetStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          token,
          user: sessionUser,
          loginAt: new Date().toISOString()
        })
      );

      setUser(sessionUser);
      setIsAuthenticated(true);
      return sessionUser;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestOtp = useCallback(async (payload) => {
    return authService.requestOtp(payload);
  }, []);

  const verifyOtp = useCallback(async (payload) => {
    const rememberMe = payload?.rememberMe !== false;
    setIsLoading(true);
    try {
      const response = await authService.verifyOtp(payload);
      const token = response?.data?.token;
      const sessionUser = response?.data?.user;

      if (!token || !sessionUser?.id) {
        throw new Error('OTP verification returned incomplete response');
      }

      const targetStorage = rememberMe ? localStorage : sessionStorage;
      const resetStorage = rememberMe ? sessionStorage : localStorage;
      resetStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.setItem(AUTH_STORAGE_MODE_KEY, rememberMe ? 'local' : 'session');

      targetStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          token,
          user: sessionUser,
          loginAt: new Date().toISOString()
        })
      );

      setUser(sessionUser);
      setIsAuthenticated(true);
      return sessionUser;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Logout user
   */
  const logout = useCallback(() => {
    authService.logout().catch(() => {
      // Ignore network/auth errors on logout cleanup.
    });
    clearStoredSession();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const updateProfile = useCallback((patch = {}) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      try {
        const storage = getPreferredStorage();
        const current = JSON.parse(storage.getItem(AUTH_STORAGE_KEY) || '{}');
        storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...current, user: next }));
      } catch (_err) {
        // Ignore storage write errors and keep in-memory state updated.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      clearStoredSession();
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);
  
  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    login,
    googleLogin,
    requestOtp,
    verifyOtp,
    logout,
    updateProfile
  }), [user, isAuthenticated, isLoading, login, googleLogin, requestOtp, verifyOtp, logout, updateProfile]);
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: async () => {
        throw new Error('AuthProvider is not mounted');
      },
      googleLogin: async () => {
        throw new Error('AuthProvider is not mounted');
      },
      requestOtp: async () => {
        throw new Error('AuthProvider is not mounted');
      },
      verifyOtp: async () => {
        throw new Error('AuthProvider is not mounted');
      },
      logout: () => {},
      updateProfile: () => {}
    };
  }
  return ctx;
};
