// src/components/ui/ThemeToggle.jsx
import React, { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

const ThemeToggle = () => {
  const { mode, toggle } = useTheme();
  const isDark = mode === "dark";

  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={toggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`
        fixed bottom-6 right-6 z-50
        w-14 h-14 rounded-full
        flex items-center justify-center
        transition-all duration-300 ease-[cubic-bezier(.2,.9,.3,1)]
        backdrop-blur-xl 
        shadow-[0_0_25px_rgba(0,0,0,0.25)]
        border border-white/20 dark:border-white/10

        ${isDark 
          ? "bg-white/10 hover:bg-white/20"
          : "bg-black/10 hover:bg-black/20"}
        
        ${hover ? "scale-110" : "scale-100"}
      `}
      style={{
        boxShadow: isDark
          ? hover
            ? "0 0 25px rgba(147,51,234,0.8)"
            : "0 0 15px rgba(147,51,234,0.45)"
          : hover
          ? "0 0 25px rgba(99,102,241,0.7)"
          : "0 0 12px rgba(99,102,241,0.4)"
      }}
    >
      {/* Glow ring */}
      <div
        className={`
          absolute inset-0 rounded-full pointer-events-none
          transition-all duration-500 ease-out
          ${isDark ? "shadow-[0_0_22px_rgba(168,85,247,0.55)]" : "shadow-[0_0_20px_rgba(99,102,241,0.45)]"}
          ${hover ? "opacity-80 scale-110" : "opacity-40 scale-100"}
        `}
      />

      {/* Icon morph */}
      <div
        className={`
          transition-all duration-500 flex items-center justify-center
          ${hover ? "scale-125 rotate-12" : "scale-100 rotate-0"}
        `}
      >
        {isDark ? (
          <Sun
            className="w-7 h-7 text-yellow-400 drop-shadow-[0_0_6px_rgba(255,255,0,0.6)]"
          />
        ) : (
          <Moon
            className="w-7 h-7 text-blue-400 drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]"
          />
        )}
      </div>
    </button>
  );
};

export default ThemeToggle;
