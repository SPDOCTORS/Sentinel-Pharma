import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Beaker,
  LayoutDashboard,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { useModel } from '../../context/ModelContext';

/**
 * NAV_ITEMS
 * ---------
 * "Reports" sidebar entry is intentionally disabled.
 * The existing route `/report/:requestId` opens a specific report by ID
 * (reached via links inside the dashboard), so there is no standalone
 * /reports listing page. The entry stays visible to communicate future intent.
 */
const NAV_ITEMS = [
  { to: '/',       icon: LayoutDashboard, label: 'Research' },
  { to: '/reports', icon: FileText,        label: 'Reports',  disabled: true, comingSoon: true },
];

const Sidebar = () => {
  const { selectedModel, setSelectedModel } = useModel();
  const location  = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const isLocal = selectedModel === 'ollama';

  return (
    <aside
      className={`ws-sidebar ${collapsed ? 'ws-sidebar--collapsed' : ''}`}
      aria-label="Application sidebar"
    >
      {/* ── Logo row ── */}
      <div className="ws-sidebar__logo">
        <Link to="/" aria-label="SentinelPharma home" className="ws-sidebar__brand">
          <span className="ws-sidebar__brand-icon">
            <Beaker className="h-4 w-4" />
          </span>
          {!collapsed && (
            <span className="ws-sidebar__brand-text">
              <span className="ws-sidebar__brand-name">SentinelPharma</span>
              <span className="ws-sidebar__brand-sub">Evidence Workbench</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="ws-sidebar__collapse-btn"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* ── Primary navigation ── */}
      <nav className="ws-sidebar__nav" aria-label="Primary navigation">
        {NAV_ITEMS.map(({ to, icon: Icon, label, disabled, comingSoon }) => {
          const active = !disabled && location.pathname === to;
          return (
            <Link
              key={to}
              to={disabled ? '#' : to}
              aria-current={active ? 'page' : undefined}
              aria-disabled={disabled}
              title={comingSoon ? 'Coming soon' : label}
              className={[
                'ws-nav-item',
                active   ? 'ws-nav-item--active'   : '',
                disabled ? 'ws-nav-item--disabled'  : '',
              ].join(' ')}
              tabIndex={disabled ? -1 : 0}
              onClick={disabled ? (e) => e.preventDefault() : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && (
                <span className="ws-nav-item__label">
                  {label}
                  {comingSoon && <span className="ws-nav-item__soon">Soon</span>}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom: inference provider only ── */}
      <div className="ws-sidebar__bottom">
        {collapsed ? (
          /* Collapsed: single dot shows current mode, click to toggle */
          <button
            type="button"
            title={isLocal ? 'Ollama (local) — click to switch' : 'Gemini (cloud) — click to switch'}
            onClick={() => setSelectedModel(isLocal ? 'gemini' : 'ollama')}
            className="ws-sidebar__icon-btn ws-sidebar__icon-btn--center"
            aria-label={`Inference: ${isLocal ? 'local' : 'cloud'}. Click to switch.`}
          >
            <span
              className={`ws-inference-dot ${isLocal ? 'ws-inference-dot--local' : 'ws-inference-dot--cloud'}`}
              aria-hidden="true"
            />
          </button>
        ) : (
          <div className="ws-sidebar__inference-block">
            <p className="ws-sidebar__label">Inference</p>
            <div className="ws-segment" role="group" aria-label="Inference provider">
              <button
                type="button"
                onClick={() => setSelectedModel('gemini')}
                aria-pressed={!isLocal}
                className={`ws-segment__btn ${!isLocal ? 'ws-segment__btn--active' : ''}`}
              >
                Gemini
              </button>
              <button
                type="button"
                onClick={() => setSelectedModel('ollama')}
                aria-pressed={isLocal}
                className={`ws-segment__btn ${isLocal ? 'ws-segment__btn--active' : ''}`}
              >
                Ollama
              </button>
            </div>
            <p className="ws-sidebar__meta">
              {isLocal ? '🔒 Local · private' : '☁ Cloud · connected'}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
