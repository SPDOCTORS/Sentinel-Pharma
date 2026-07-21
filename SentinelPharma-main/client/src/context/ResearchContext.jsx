// ResearchContext.jsx
/**
 * SentinelPharma Research Context
 * ===========================
 * Global state management for research operations.
 * Manages privacy mode toggle and research state.
 *
 * Improvements:
 * - Exports a safe `useResearch()` hook which logs a clear error if the provider
 *   is not present and returns safe no-op defaults (prevents the "cannot destructure"
 *   runtime crash).
 * - Keeps your original logic and API intact.
 */

import React, { createContext, useState, useCallback, useContext } from 'react';

export const ResearchContext = createContext(undefined);

export const ResearchProvider = ({ children }) => {
  // Privacy mode: 'secure' (local) or 'cloud' (Gemini)
  const [privacyMode, setPrivacyMode] = useState('cloud');

  // Current research state
  const [currentResearch, setCurrentResearch] = useState(null);

  // Research history
  const [researchHistory, setResearchHistory] = useState([]);

  /**
   * Add completed research to history
   */
  const addToHistory = useCallback((research) => {
    setResearchHistory(prev => [
      { ...research, timestamp: new Date().toISOString() },
      ...prev.slice(0, 9) // Keep last 10
    ]);
  }, []);

  /**
   * Clear research history
   */
  const clearHistory = useCallback(() => {
    setResearchHistory([]);
  }, []);

  const value = {
    privacyMode,
    setPrivacyMode,
    currentResearch,
    setCurrentResearch,
    researchHistory,
    addToHistory,
    clearHistory
  };

  return (
    <ResearchContext.Provider value={value}>
      {children}
    </ResearchContext.Provider>
  );
};

/**
 * useResearch
 * - Safe hook for consuming ResearchContext.
 * - If there is no provider, this will:
 *    1) emit a clear console.error explaining the problem
 *    2) return a safe fallback object (no-op setters) so consuming components don't crash
 *
 * Usage:
 *   const { privacyMode, setPrivacyMode } = useResearch();
 */
export const useResearch = () => {
  const ctx = useContext(ResearchContext);
  if (!ctx) {
    // Helpful dev-time message to quickly find missing provider issues
    /* eslint-disable no-console */
    console.error(
      '[ResearchContext] missing provider: wrap your app with <ResearchProvider>.\n' +
      'Example:\n  <ResearchProvider>\n    <App />\n  </ResearchProvider>\n' +
      'Falling back to safe defaults to avoid runtime crash.'
    );
    /* eslint-enable no-console */

    // Safe no-op fallbacks (keeps UI stable and avoids exceptions)
    const noop = () => {};
    return {
      privacyMode: 'cloud',
      setPrivacyMode: noop,
      currentResearch: null,
      setCurrentResearch: noop,
      researchHistory: [],
      addToHistory: noop,
      clearHistory: noop
    };
  }
  return ctx;
};
