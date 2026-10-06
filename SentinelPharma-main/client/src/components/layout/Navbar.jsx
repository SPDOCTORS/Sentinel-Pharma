import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Beaker, ChevronDown, LogIn, LogOut, Menu, Moon, Settings, Sun, X } from 'lucide-react';

import { useResearch } from '../../context/ResearchContext';
import { useTheme } from '../../context/ThemeContext';
import { useModel } from '../../context/ModelContext';
import { useAuth } from '../../context/AuthContext';

const Navbar = () => {
  const navigate = useNavigate();
  const { setPrivacyMode } = useResearch();
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

  useEffect(() => {
    setPrivacyMode(selectedModel === 'ollama' ? 'secure' : 'cloud');
  }, [selectedModel, setPrivacyMode]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (showNotifications && notificationRef.current && !notificationRef.current.contains(event.target)) setShowNotifications(false);
      if (showSettingsPanel && settingsRef.current && !settingsRef.current.contains(event.target)) setShowSettingsPanel(false);
      if (showUserMenu && userRef.current && !userRef.current.contains(event.target)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showNotifications, showSettingsPanel, showUserMenu]);

  const isLocalModel = selectedModel === 'ollama';
  const displayName = user?.name || user?.email || 'Research User';
  const closePanels = () => {
    setShowNotifications(false);
    setShowSettingsPanel(false);
    setShowUserMenu(false);
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--research-border)] bg-[var(--research-surface)]" aria-label="Primary navigation">
      <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between gap-4 px-4">
        <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="SentinelPharma research workspace">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--research-action)] text-white"><Beaker className="h-5 w-5" /></span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-[var(--research-ink)]">SentinelPharma</span>
            <span className="hidden text-[11px] text-[var(--research-muted)] sm:block">Biomedical evidence workbench</span>
          </span>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          <div className="flex items-center rounded-lg border border-[var(--research-border)] bg-[var(--research-surface-muted)] p-1" aria-label="Inference provider">
            <button type="button" onClick={() => setSelectedModel('gemini')} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${!isLocalModel ? 'bg-[var(--research-surface)] text-[var(--research-ink)]' : 'text-[var(--research-muted)]'}`} aria-pressed={!isLocalModel}>Gemini</button>
            <button type="button" onClick={() => setSelectedModel('ollama')} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${isLocalModel ? 'bg-[var(--research-surface)] text-[var(--research-ink)]' : 'text-[var(--research-muted)]'}`} aria-pressed={isLocalModel}>Ollama</button>
          </div>
          <span className="rounded-md border border-[var(--research-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--research-muted)]">{isLocalModel ? 'Local secure mode' : 'Cloud mode'}</span>
          <button type="button" onClick={toggle} className="research-secondary-button p-2" aria-label="Toggle theme">{mode === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</button>

          <div className="relative" ref={notificationRef}>
            <button type="button" onClick={() => { const next = !showNotifications; closePanels(); setShowNotifications(next); }} className="research-secondary-button p-2" aria-label="Open notifications" aria-expanded={showNotifications}><Bell className="h-4 w-4" /></button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[var(--research-border)] bg-[var(--research-surface)] p-3 text-[var(--research-ink)]">
                <div className="flex items-center justify-between border-b border-[var(--research-border)] pb-2"><h2 className="text-sm font-bold">Notifications</h2><span className="text-xs text-[var(--research-muted)]">{notifications.length} recent</span></div>
                <div className="mt-2 space-y-1">{notifications.map((item) => <div key={item.id} className="rounded-lg p-2 hover:bg-[var(--research-surface-muted)]"><p className="text-sm font-semibold">{item.title}</p><p className="mt-0.5 text-xs text-[var(--research-muted)]">{item.desc}</p><p className="mt-1 text-[11px] text-[var(--research-muted)]">{item.time}</p></div>)}</div>
              </div>
            )}
          </div>

          <div className="relative" ref={settingsRef}>
            <button type="button" onClick={() => { const next = !showSettingsPanel; closePanels(); setShowSettingsPanel(next); }} className="research-secondary-button p-2" aria-label="Open settings" aria-expanded={showSettingsPanel}><Settings className="h-4 w-4" /></button>
            {showSettingsPanel && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl border border-[var(--research-border)] bg-[var(--research-surface)] p-3 text-[var(--research-ink)]">
                <h2 className="border-b border-[var(--research-border)] pb-2 text-sm font-bold">Research settings</h2>
                <div className="mt-3 space-y-2">
                  <button type="button" onClick={() => setSelectedModel('gemini')} className="research-secondary-button w-full justify-between">Gemini cloud <span>{!isLocalModel ? 'Selected' : ''}</span></button>
                  <button type="button" onClick={() => setSelectedModel('ollama')} className="research-secondary-button w-full justify-between">Ollama local <span>{isLocalModel ? 'Selected' : ''}</span></button>
                  <button type="button" onClick={toggle} className="research-secondary-button w-full justify-between">Theme <span>{mode}</span></button>
                </div>
              </div>
            )}
          </div>

          {isAuthenticated ? (
            <div className="relative" ref={userRef}>
              <button type="button" onClick={() => { const next = !showUserMenu; closePanels(); setShowUserMenu(next); }} className="research-secondary-button max-w-48" aria-expanded={showUserMenu}><span className="truncate">{displayName}</span><ChevronDown className="h-4 w-4 shrink-0" /></button>
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-[var(--research-border)] bg-[var(--research-surface)] p-3 text-[var(--research-ink)]">
                  <div className="rounded-lg bg-[var(--research-surface-muted)] p-3"><p className="text-sm font-semibold">{displayName}</p><p className="mt-0.5 truncate text-xs text-[var(--research-muted)]">{user?.email}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-[var(--research-primary)]">{user?.role || 'researcher'}</p></div>
                  <button type="button" onClick={() => { logout(); setShowUserMenu(false); navigate('/login'); }} className="mt-3 research-secondary-button w-full justify-center text-red-700 dark:text-red-300"><LogOut className="h-4 w-4" /> Sign out</button>
                </div>
              )}
            </div>
          ) : <Link to="/login" className="research-primary-button"><LogIn className="h-4 w-4" />{authLoading ? 'Checking...' : 'Sign in'}</Link>}
        </div>

        <button type="button" onClick={() => setIsMobileMenuOpen((open) => !open)} className="research-secondary-button p-2 md:hidden" aria-label="Toggle navigation" aria-expanded={isMobileMenuOpen}>{isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t border-[var(--research-border)] bg-[var(--research-surface)] px-4 py-4 md:hidden">
          <div className="mx-auto grid max-w-lg gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--research-muted)]">Inference provider</p>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setSelectedModel('gemini')} className="research-secondary-button justify-center">Gemini {!isLocalModel && '· Selected'}</button><button type="button" onClick={() => setSelectedModel('ollama')} className="research-secondary-button justify-center">Ollama {isLocalModel && '· Selected'}</button></div>
            <button type="button" onClick={toggle} className="research-secondary-button justify-between">Theme <span>{mode}</span></button>
            {isAuthenticated ? <button type="button" onClick={() => { logout(); setIsMobileMenuOpen(false); navigate('/login'); }} className="research-secondary-button justify-center text-red-700 dark:text-red-300"><LogOut className="h-4 w-4" />Sign out</button> : <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="research-primary-button"><LogIn className="h-4 w-4" />Sign in</Link>}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
