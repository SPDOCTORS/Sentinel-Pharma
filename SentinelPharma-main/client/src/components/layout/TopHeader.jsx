import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogIn, LogOut, Moon, Sun } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useResearch } from '../../context/ResearchContext';

const NOTIFICATIONS = [
  { id: 1, title: 'Model artifact refreshed', desc: 'Latest GNN training artifact is active.',       time: 'Just now' },
  { id: 2, title: 'Online update completed',   desc: 'New relation batch was merged to the graph.',   time: '5m ago'   },
  { id: 3, title: 'Research run finished',     desc: 'Analysis pipeline returned ranked candidates.', time: '12m ago'  },
];

const TopHeader = ({ title = 'Research Dashboard' }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { mode, toggle } = useTheme();
  const { privacyMode } = useResearch();
  const navigate = useNavigate();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu]           = useState(false);

  const bellRef = useRef(null);
  const userRef = useRef(null);

  const displayName = user?.name || user?.email || 'Research User';
  const initials    = displayName.slice(0, 2).toUpperCase();

  // Close dropdowns on outside mousedown
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setShowNotifications(false);
      if (userRef.current && !userRef.current.contains(e.target))  setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const closeAll = () => { setShowNotifications(false); setShowUserMenu(false); };

  return (
    <header className="ws-topbar" role="banner">
      {/* Left: page title + privacy badge */}
      <div className="ws-topbar__left">
        <h1 className="ws-topbar__title">{title}</h1>
        {privacyMode && (
          <span
            className={`ws-privacy-badge ${privacyMode === 'secure' ? 'ws-privacy-badge--secure' : 'ws-privacy-badge--cloud'}`}
            aria-label={`Privacy mode: ${privacyMode}`}
          >
            {privacyMode === 'secure' ? '🔒 Local' : '☁ Cloud'}
          </span>
        )}
      </div>

      {/* Right: theme · notifications · user */}
      <div className="ws-topbar__right">

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className="ws-topbar__icon-btn"
          aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
          title={`Theme: ${mode}`}
        >
          {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notifications */}
        <div className="ws-topbar__dropdown-anchor" ref={bellRef}>
          <button
            type="button"
            onClick={() => { const next = !showNotifications; closeAll(); setShowNotifications(next); }}
            aria-label="Open notifications"
            aria-expanded={showNotifications}
            aria-haspopup="true"
            className="ws-topbar__icon-btn"
          >
            <Bell className="h-4 w-4" />
            <span className="ws-notification-dot" aria-hidden="true" />
          </button>

          {showNotifications && (
            <div className="ws-dropdown" role="dialog" aria-label="Notifications">
              <div className="ws-dropdown__header">
                <span className="ws-dropdown__heading">Notifications</span>
                <span className="ws-dropdown__count">{NOTIFICATIONS.length} recent</span>
              </div>
              <ul className="ws-dropdown__list">
                {NOTIFICATIONS.map((n) => (
                  <li key={n.id} className="ws-dropdown__item">
                    <p className="ws-dropdown__item-title">{n.title}</p>
                    <p className="ws-dropdown__item-desc">{n.desc}</p>
                    <p className="ws-dropdown__item-time">{n.time}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Divider */}
        <span className="ws-topbar__divider" aria-hidden="true" />

        {/* User profile chip / sign-in */}
        {isAuthenticated ? (
          <div className="ws-topbar__dropdown-anchor" ref={userRef}>
            <button
              type="button"
              onClick={() => { const next = !showUserMenu; closeAll(); setShowUserMenu(next); }}
              className="ws-topbar__user-chip"
              aria-expanded={showUserMenu}
              aria-haspopup="true"
              aria-label="Open user menu"
            >
              <span className="ws-topbar__avatar" aria-hidden="true">{initials}</span>
              <span className="ws-topbar__user-name">{displayName}</span>
              <ChevronDown className={`h-3.5 w-3.5 ws-topbar__chevron ${showUserMenu ? 'ws-topbar__chevron--open' : ''}`} aria-hidden="true" />
            </button>

            {showUserMenu && (
              <div className="ws-dropdown ws-dropdown--right" role="dialog" aria-label="User menu">
                {/* Profile row */}
                <div className="ws-dropdown__profile">
                  <span className="ws-dropdown__avatar-lg" aria-hidden="true">{initials}</span>
                  <div>
                    <p className="ws-dropdown__profile-name">{displayName}</p>
                    {user?.email && <p className="ws-dropdown__profile-email">{user.email}</p>}
                    <p className="ws-dropdown__profile-role">{user?.role || 'Researcher'}</p>
                  </div>
                </div>
                {/* Sign out */}
                <div className="ws-dropdown__footer">
                  <button
                    type="button"
                    onClick={() => { logout(); setShowUserMenu(false); navigate('/login'); }}
                    className="ws-dropdown__signout"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login" className="ws-topbar__signin-btn">
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
};

export default TopHeader;
