// src/components/dashboard/AgentStatusCard.jsx
import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Clock, Eye, Sparkles } from 'lucide-react';

/**
 * AgentStatusCard
 * - Replaces "transition-all" with explicit transition classes to avoid React warning.
 * - Uses `animationDelay` inline only (safe).
 * - Adds dark: variants and purple neon hover glow.
 */

const AgentStatusCard = ({
  name,
  status,
  icon: Icon,
  delay = 0,
  onClick,
  isSelected = false,
  hasResults = false
}) => {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    // reset tilt when not hovering
    if (!hovering) setTilt({ x: 0, y: 0 });
  }, [hovering]);

  // Status styling configuration
  const statusConfig = {
    idle: {
      bg: 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900',
      text: 'text-gray-500 dark:text-gray-300',
      iconBg: 'bg-gray-200 dark:bg-neutral-700',
      iconText: 'text-gray-400 dark:text-gray-200',
      border: 'border-gray-200 dark:border-neutral-700',
      label: 'Standby',
      StatusIcon: Clock
    },
    thinking: {
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800',
      text: 'text-blue-600 dark:text-blue-300',
      iconBg: 'bg-gradient-to-br from-blue-400 to-indigo-500',
      iconText: 'text-white',
      border: 'border-blue-200 dark:border-indigo-800',
      label: 'Analyzing...',
      StatusIcon: Loader2,
      animate: true,
      pulse: true
    },
    completed: {
      bg: 'bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900 dark:to-emerald-800',
      text: 'text-emerald-600 dark:text-emerald-300',
      iconBg: 'bg-gradient-to-br from-emerald-400 to-green-500',
      iconText: 'text-white',
      border: 'border-emerald-200 dark:border-emerald-700',
      label: 'Complete',
      StatusIcon: CheckCircle2
    },
    error: {
      bg: 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-rose-900 dark:to-rose-800',
      text: 'text-red-600 dark:text-red-300',
      iconBg: 'bg-gradient-to-br from-red-400 to-rose-500',
      iconText: 'text-white',
      border: 'border-red-200 dark:border-rose-700',
      label: 'Error',
      StatusIcon: AlertCircle
    }
  };

  const cfg = statusConfig[status] || statusConfig.idle;
  const { StatusIcon } = cfg;
  const isClickable = status === 'completed' && hasResults;

  // mouse move handler for subtle 3D tilt (small and safe)
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 8; // tilt strength X
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -8; // tilt strength Y
    setTilt({ x, y });
  };

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onMouseMove={handleMouseMove}
      className={`
        relative rounded-2xl p-4 overflow-hidden border-2
        ${cfg.bg} ${cfg.border}
        ${isSelected ? 'ring-4 ring-indigo-100 shadow-xl scale-105' : ''}
        ${isClickable ? 'cursor-pointer hover:shadow-2xl' : ''}
        transform-gpu will-change-transform
      `}
      style={{
        // only animationDelay left inline (safe)
        animationDelay: `${delay}ms`,
        transform: `perspective(900px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) translateZ(0)`,
        transitionProperty: 'transform, box-shadow, filter',
        transitionDuration: '280ms',
        transitionTimingFunction: 'cubic-bezier(.2,.9,.3,1)'
      }}
    >
      {/* Neon/Purple glow background when hovered */}
      <div
        aria-hidden
        className={`
          pointer-events-none absolute inset-0 rounded-2xl blur-3xl opacity-0
          ${hovering ? 'opacity-80' : 'opacity-0'}
          transition-opacity duration-400
        `}
        style={{
          background:
            'radial-gradient(60% 40% at 10% 20%, rgba(139,92,246,0.18), transparent 15%), radial-gradient(50% 30% at 90% 80%, rgba(168,85,247,0.10), transparent 20%)'
        }}
      />

      {/* subtle pulse rings for completed */}
      {status === 'completed' && (
        <div className="absolute -inset-2 pointer-events-none">
          <div className="absolute inset-0 rounded-2xl animate-pulse-slow opacity-50" style={{ boxShadow: '0 8px 30px rgba(168,85,247,0.06)' }} />
        </div>
      )}

      <div className="relative flex flex-col items-center text-center space-y-3">
        {/* icon */}
        <div className={`p-3 rounded-xl shadow-lg transition-transform duration-300 ${isClickable ? 'group-hover:scale-105' : ''} ${isSelected ? 'ring-4 ring-white shadow-indigo-200' : ''}`}>
          <div className={`${cfg.iconBg} ${cfg.iconText} p-2 rounded-lg`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>

        {/* name */}
        <h4 className={`font-semibold text-sm leading-tight ${isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-gray-800 dark:text-gray-100'}`}>
          {name.replace(' Agent', '')}
        </h4>

        {/* status badge */}
        <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/70 dark:bg-black/30 backdrop-blur-sm text-xs font-medium shadow-sm ${cfg.text}`}>
          <StatusIcon className={`w-3.5 h-3.5 ${cfg.animate ? 'animate-spin' : ''}`} />
          <span>{cfg.label}</span>
        </div>

        {/* view details button - animated slide-in on hover */}
        {isClickable && (
          <div
            className={`
              w-full mt-2 py-1.5 px-3 rounded-lg text-xs font-medium text-gray-600 flex items-center justify-center space-x-1.5 shadow-sm
              transform transition-transform duration-300
              ${hovering ? 'translate-y-0 scale-105 bg-white/90 text-green-700' : 'translate-y-3 opacity-80 bg-white/80'}
            `}
            style={{
              // don't set transition shorthand elsewhere
              transitionProperty: 'transform, background-color, color',
              transitionDuration: '320ms',
              transitionTimingFunction: 'cubic-bezier(.2,.9,.3,1)'
            }}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View Details</span>
          </div>
        )}
      </div>

      {/* selected indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2">
          <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center shadow-lg">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      )}

      {/* thinking shimmer effect - keep minimal */}
      {status === 'thinking' && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
      )}
    </div>
  );
};

export default AgentStatusCard;
