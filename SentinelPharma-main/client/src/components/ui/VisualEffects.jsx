/**
 * Visual Effects Library
 * Professional 2D/3D UI Components
 */

import React from 'react';
import { motion } from 'framer-motion';

// ============================================
// Floating Particles Background
// ============================================
export const ParticleBackground = ({ count = 50, color = 'blue' }) => {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    delay: Math.random() * 15,
    duration: 15 + Math.random() * 10,
    left: `${Math.random() * 100}%`,
    size: 2 + Math.random() * 4,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: particle.left,
            width: particle.size,
            height: particle.size,
            background: `radial-gradient(circle, rgba(59, 130, 246, 0.8), transparent)`,
          }}
          initial={{ y: '100vh', opacity: 0 }}
          animate={{
            y: '-100vh',
            x: [0, 50, -50, 0],
            opacity: [0, 0.5, 0.5, 0],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
};

// ============================================
// 3D Card with Tilt Effect
// ============================================
export const Card3D = ({ children, className = '', intensity = 10 }) => {
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    setTilt({
      x: (y - 0.5) * intensity,
      y: (x - 0.5) * -intensity,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  return (
    <motion.div
      className={`perspective-container ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: 1000 }}
    >
      <motion.div
        className="card-3d w-full h-full"
        animate={{
          rotateX: tilt.x,
          rotateY: tilt.y,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

// ============================================
// Animated Counter
// ============================================
export const AnimatedCounter = ({ value, prefix = '', suffix = '', decimals = 0, duration = 1 }) => {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    let start = 0;
    const end = parseFloat(value) || 0;
    const increment = end / (duration * 60);

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, 1000 / 60);

    return () => clearInterval(timer);
  }, [value, duration]);

  return (
    <motion.span
      className="metric-value font-bold"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {prefix}
      {count.toFixed(decimals)}
      {suffix}
    </motion.span>
  );
};

// ============================================
// Glowing Button
// ============================================
export const GlowButton = ({ children, onClick, variant = 'primary', className = '' }) => {
  const variants = {
    primary: 'from-blue-600 to-cyan-500',
    success: 'from-green-600 to-emerald-500',
    warning: 'from-orange-600 to-yellow-500',
    danger: 'from-red-600 to-pink-500',
  };

  return (
    <motion.button
      className={`relative px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r ${variants[variant]} overflow-hidden ${className}`}
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className="absolute inset-0 bg-white opacity-0"
        whileHover={{ opacity: 0.2 }}
        transition={{ duration: 0.3 }}
      />
      <span className="relative z-10">{children}</span>
      <motion.div
        className="absolute inset-0 opacity-0"
        animate={{
          opacity: [0, 0.3, 0],
          scale: [0.8, 1.2, 0.8],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.5), transparent)',
          filter: 'blur(10px)',
        }}
      />
    </motion.button>
  );
};

// ============================================
// Progress Ring
// ============================================
export const ProgressRing = ({ progress = 0, size = 120, strokeWidth = 8, color = '#3b82f6' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </svg>
  );
};

// ============================================
// Holographic Card
// ============================================
export const HolographicCard = ({ children, className = '' }) => {
  return (
    <motion.div
      className={`holographic rounded-xl p-6 ${className}`}
      whileHover={{
        scale: 1.02,
        boxShadow: '0 20px 40px rgba(59, 130, 246, 0.3)',
      }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
};

// ============================================
// Shimmer Loading Effect
// ============================================
export const ShimmerCard = ({ className = '' }) => {
  return (
    <div className={`relative overflow-hidden bg-gray-200 rounded-lg ${className}`}>
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-50"
        animate={{
          x: ['-100%', '200%'],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </div>
  );
};

// ============================================
// Floating Icon
// ============================================
export const FloatingIcon = ({ icon: Icon, delay = 0, className = '' }) => {
  return (
    <motion.div
      className={className}
      animate={{
        y: [0, -10, 0],
        rotate: [0, 5, 0, -5, 0],
      }}
      transition={{
        duration: 3,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <Icon className="w-full h-full" />
    </motion.div>
  );
};

// ============================================
// Gradient Text
// ============================================
export const GradientText = ({ children, gradient = 'from-blue-600 to-cyan-500', className = '' }) => {
  return (
    <span className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent font-bold ${className}`}>
      {children}
    </span>
  );
};

// ============================================
// Data Visualization Card
// ============================================
export const DataCard = ({ title, value, change, icon: Icon, trend = 'up' }) => {
  const trendColor = trend === 'up' ? 'text-green-600' : 'text-red-600';
  const trendBg = trend === 'up' ? 'bg-green-50' : 'bg-red-50';

  return (
    <motion.div
      className="data-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-600">{title}</span>
        {Icon && (
          <div className="p-2 bg-blue-50 rounded-lg">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <AnimatedCounter
            value={value}
            decimals={2}
            className="text-2xl font-bold text-gray-900"
          />
        </div>
        {change && (
          <div className={`flex items-center px-2 py-1 rounded-md ${trendBg}`}>
            <span className={`text-sm font-semibold ${trendColor}`}>
              {trend === 'up' ? '↑' : '↓'} {change}%
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ============================================
// Agent Status Indicator
// ============================================
export const AgentStatusBadge = ({ status = 'idle', name }) => {
  const statusConfig = {
    idle: { color: 'bg-gray-400', label: 'Idle', glow: '' },
    running: { color: 'bg-blue-500', label: 'Running', glow: 'pulse-glow' },
    completed: { color: 'bg-green-500', label: 'Completed', glow: '' },
    error: { color: 'bg-red-500', label: 'Error', glow: '' },
  };

  const config = statusConfig[status] || statusConfig.idle;

  return (
    <motion.div
      className={`inline-flex items-center px-3 py-1 rounded-full ${config.glow}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className={`w-2 h-2 rounded-full ${config.color} mr-2`}
        animate={status === 'running' ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span className="text-xs font-medium text-gray-700">{name}</span>
    </motion.div>
  );
};

export default {
  ParticleBackground,
  Card3D,
  AnimatedCounter,
  GlowButton,
  ProgressRing,
  HolographicCard,
  ShimmerCard,
  FloatingIcon,
  GradientText,
  DataCard,
  AgentStatusBadge,
};
