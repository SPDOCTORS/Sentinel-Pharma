/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // <-- use class-based dark mode
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // SentinelPharma Brand Colors
        pharma: {
          primary: '#0066CC',
          secondary: '#00A3E0',
          accent: '#00D4AA',
          dark: '#1A1F36',
          light: '#F7F9FC'
        }
      },
      keyframes: {
        // slower, smoother pulse
        'pulse-slow': {
          '0%': { transform: 'scale(0.99)', opacity: '0.85' },
          '50%': { transform: 'scale(1.02)', opacity: '1' },
          '100%': { transform: 'scale(0.99)', opacity: '0.85' }
        },
        // shimmer for subtle loading effect
        shimmer: {
          '0%': { transform: 'translateX(-110%)' },
          '100%': { transform: 'translateX(110%)' }
        },
        // slow spin (if needed)
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        }
      },
      animation: {
        'pulse-slow': 'pulse-slow 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'shimmer': 'shimmer 1.8s linear infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
      },
      boxShadow: {
        // subtle brand-ish neon shadows you can use: 'neon-purple' => shadow-lg shadow-purple-ish
        'neon-purple': '0 8px 30px rgba(168,85,247,0.12), inset 0 1px 0 rgba(255,255,255,0.02)',
        'soft-indigo': '0 10px 30px rgba(99,102,241,0.08)'
      }
    },
  },
  plugins: [],
}
