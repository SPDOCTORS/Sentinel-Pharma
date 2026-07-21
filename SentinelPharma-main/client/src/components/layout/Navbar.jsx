import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Shield,
  Menu,
  X,
  Beaker,
  Settings,
  Bell,
  Sun,
  Moon,
  Sparkles,
  LogIn,
  LogOut,
  ChevronDown
} from 'lucide-react';

import { useResearch } from '../../context/ResearchContext';
import { useTheme } from '../../context/ThemeContext';
import { useModel } from '../../context/ModelContext';
import { useAuth } from '../../context/AuthContext';

const Navbar = () => {
  const navigate = useNavigate();
  const { privacyMode, setPrivacyMode } = useResearch();
  const { mode, toggle } = useTheme();
  const { selectedModel, setSelectedModel } = useModel();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const notificationRef = useRef(null);
  const settingsRef = useRef(null);
  const userRef = useRef(null);

  const notifications = [
    { id: 1, title: 'Model artifact refreshed', desc: 'Latest GNN training artifact is active.', time: 'Just now' },
    { id: 2, title: 'Online update completed', desc: 'New relation batch was merged to the graph.', time: '5m ago' },
    { id: 3, title: 'Research run finished', desc: 'Analysis pipeline returned ranked candidates.', time: '12m ago' }
  ];

  const handleModelToggle = () => {
    const newModel = selectedModel === 'ollama' ? 'gemini' : 'ollama';
    setSelectedModel(newModel);
    setPrivacyMode(newModel === 'ollama' ? 'secure' : 'cloud');
  };

  useEffect(() => {
    setPrivacyMode(selectedModel === 'ollama' ? 'secure' : 'cloud');
  }, [selectedModel, setPrivacyMode]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (showNotifications && notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (showSettingsPanel && settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettingsPanel(false);
      }
      if (showUserMenu && userRef.current && !userRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showNotifications, showSettingsPanel, showUserMenu]);

  const isLocalModel = selectedModel === 'ollama';
  const displayName = user?.name || user?.email || 'Research User';

  return (
    <nav className="bg-white dark:bg-[#071018] shadow-sm border-b border-gray-200 dark:border-white/10 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Beaker className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">SentinelPharma</span>
              <span className="hidden sm:block text-xs text-gray-500 dark:text-gray-400">Drug Repurposing AI</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center space-x-4">
            <button
              onClick={toggle}
              className="relative w-16 h-8 rounded-full transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:ring-offset-slate-900 focus:ring-indigo-500 overflow-hidden group shadow-lg hover:shadow-xl transform hover:scale-105"
              style={{
                background: mode === 'dark'
                  ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)'
                  : 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%)'
              }}
              aria-label="Toggle theme"
            >
              <div className="absolute inset-0 transition-all duration-500">
                {mode === 'dark' ? (
                  <div className="absolute inset-0 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-b from-sky-300 via-blue-400 to-blue-500" />
                )}
              </div>
              <span
                className={`absolute top-1 w-6 h-6 rounded-full shadow-lg transform transition-all duration-500 flex items-center justify-center ${
                  mode === 'dark'
                    ? 'translate-x-1 bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-900'
                    : 'translate-x-9 bg-gradient-to-br from-yellow-300 to-orange-400 shadow-yellow-500/50'
                }`}
              >
                {mode === 'dark' ? <Moon className="w-4 h-4 text-slate-100" /> : <Sun className="w-4 h-4 text-white" />}
              </span>
            </button>

            <div className="flex items-center space-x-3 bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-2 border border-gray-200 dark:border-gray-700">
              <span className={`text-sm font-medium transition-colors ${isLocalModel ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                <Shield className="w-4 h-4 inline mr-1" />Ollama
              </span>
              <button
                onClick={handleModelToggle}
                className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${isLocalModel ? 'bg-green-500 focus:ring-green-500' : 'bg-blue-500 focus:ring-blue-500'}`}
                role="switch"
                aria-checked={isLocalModel}
                aria-label="AI model toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${isLocalModel ? 'translate-x-1' : 'translate-x-7'}`} />
              </button>
              <span className={`text-sm font-medium transition-colors ${!isLocalModel ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                Gemini <Sparkles className="w-4 h-4 inline ml-1" />
              </span>
            </div>

            <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${isLocalModel ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'}`}>
              {isLocalModel ? 'Secure Local Inference' : 'Cloud Inference'}
            </div>

            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => {
                  setShowNotifications((prev) => !prev);
                  setShowSettingsPanel(false);
                  setShowUserMenu(false);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Open notifications"
              >
                <Bell className="w-5 h-5" />
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3 z-50 animate-soft">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">Notifications</h4>
                    <span className="text-xs text-cyan-700 bg-cyan-50 border border-cyan-100 px-2 py-0.5 rounded-full">{notifications.length} new</span>
                  </div>
                  <div className="max-h-72 overflow-auto mt-2 space-y-2">
                    {notifications.map((item) => (
                      <div key={item.id} className="p-2.5 rounded-xl border border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.desc}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{item.time}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => {
                  setShowSettingsPanel((prev) => !prev);
                  setShowNotifications(false);
                  setShowUserMenu(false);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Open settings"
              >
                <Settings className="w-5 h-5" />
              </button>

              {showSettingsPanel && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3 z-50 animate-soft">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white pb-2 border-b border-gray-100 dark:border-slate-800">Quick Settings</h4>
                  <div className="mt-3 space-y-3">
                    <button
                      onClick={() => setSelectedModel('gemini')}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${selectedModel === 'gemini' ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                    >Use Gemini (Cloud)</button>
                    <button
                      onClick={() => setSelectedModel('ollama')}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${selectedModel === 'ollama' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                    >Use Ollama (Local)</button>
                    <button
                      onClick={toggle}
                      className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >Toggle Theme ({mode === 'dark' ? 'Dark' : 'Light'})</button>
                  </div>
                </div>
              )}
            </div>

            {isAuthenticated ? (
              <div className="relative" ref={userRef}>
                <button
                  onClick={() => {
                    setShowUserMenu((prev) => !prev);
                    setShowNotifications(false);
                    setShowSettingsPanel(false);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 text-white text-xs font-bold flex items-center justify-center">
                    {(displayName || 'U').slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold max-w-[120px] truncate">{displayName}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3 z-50 animate-soft">
                    <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 bg-gray-50/70 dark:bg-slate-800/60">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{displayName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{user?.email}</p>
                      <p className="text-xs text-cyan-700 dark:text-cyan-400 mt-1 uppercase tracking-wide">{user?.role || 'researcher'}</p>
                    </div>
                    <button
                      onClick={() => {
                        logout();
                        setShowUserMenu(false);
                        navigate('/login');
                      }}
                      className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                {authLoading ? 'Checking...' : 'Sign In'}
              </Link>
            )}
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#071018]">
            <div className="flex flex-col space-y-4 px-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Model</span>
                <button
                  onClick={handleModelToggle}
                  className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${isLocalModel ? 'bg-green-500' : 'bg-blue-500'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${isLocalModel ? 'translate-x-1' : 'translate-x-7'}`} />
                </button>
              </div>

              <div className={`text-center py-2 rounded-lg text-sm font-medium ${isLocalModel ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'}`}>
                {isLocalModel ? 'Llama 3 (Ollama)' : 'Gemini'}
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                {isAuthenticated ? (
                  <>
                    <div className="text-sm text-gray-700 dark:text-gray-300">Signed in as <span className="font-semibold">{displayName}</span></div>
                    <button
                      onClick={() => {
                        logout();
                        setIsMobileMenuOpen(false);
                        navigate('/login');
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors"
                  >
                    <LogIn className="w-4 h-4" /> Sign In
                  </Link>
                )}
              </div>

              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={toggle}
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Toggle Theme ({mode === 'dark' ? 'Dark' : 'Light'})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
