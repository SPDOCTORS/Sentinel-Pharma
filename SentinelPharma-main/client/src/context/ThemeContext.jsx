// src/context/ThemeContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children, defaultMode = 'auto' }) => {
  // 'light' | 'dark' | 'auto'
  const [mode, setMode] = useState(() => {
    if (defaultMode === 'auto') {
      try {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } catch {
        return 'light';
      }
    }
    return defaultMode;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [mode]);

  // allow listening to OS changes when mode === 'auto'
  useEffect(() => {
    if (defaultMode !== 'auto') return;
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setMode(e.matches ? 'dark' : 'light');
    mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', handler) : mq.removeListener(handler));
  }, [defaultMode]);

  const toggle = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'));
  const value = { mode, setMode, toggle };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // safe fallback
    return { mode: 'light', toggle: () => {} };
  }
  return ctx;
};
