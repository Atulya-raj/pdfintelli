"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { Sun, Moon } from "lucide-react";

interface PullStringThemeSwitchProps {
  stringLength?: number;
  className?: string;
}

export default function PullStringThemeSwitch({
  stringLength = 85,
  className = "",
}: PullStringThemeSwitchProps) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const controls = useAnimation();
  const isDraggingRef = useRef(false);
  const startDragTime = useRef(0);

  // Apply theme to document
  const applyTheme = (dark: boolean) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const body = document.body;

    if (dark) {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
      root.setAttribute("toggle-theme", "dark");
      body.setAttribute("toggle-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
      root.setAttribute("toggle-theme", "light");
      body.setAttribute("toggle-theme", "light");
      localStorage.setItem("theme", "light");
    }
    window.dispatchEvent(new Event("themeChange"));
  };

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme");
    const sysDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialDark = saved ? saved === "dark" : sysDark;
    setIsDark(initialDark);
    applyTheme(initialDark);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    applyTheme(nextDark);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch {}
    }
  };

  // Center anchor is at X = 32
  const anchorX = 32;
  const anchorY = 0;

  // Fluid SVG path from top anchor directly to handle's center
  const path = useTransform([x, y], ([cx, cy]: any[]) => {
    const currentX = anchorX + (cx || 0);
    const currentY = stringLength + (cy || 0);

    // Natural curve bowing slightly in drag direction
    const controlX = anchorX + (cx || 0) * 0.4;
    const controlY = anchorY + (stringLength + (cy || 0)) * 0.55;

    return `M ${anchorX} ${anchorY} Q ${controlX} ${controlY} ${currentX} ${currentY}`;
  });

  const handleDragStart = () => {
    isDraggingRef.current = true;
    startDragTime.current = Date.now();
  };

  const handleDragEnd = () => {
    const currentX = x.get();
    const currentY = y.get();
    const totalDistance = Math.sqrt(currentX * currentX + currentY * currentY);

    // Trigger toggle if pulled left/right/down past 45px
    if (totalDistance > 45 || currentY > 35) {
      toggleTheme();
    }

    controls.start({
      x: 0,
      y: 0,
      transition: { type: "spring", stiffness: 320, damping: 18 },
    });

    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  };

  const handleHandleClick = () => {
    // If it was just a quick click without significant drag
    const dragDuration = Date.now() - startDragTime.current;
    const currentDist = Math.sqrt(x.get() * x.get() + y.get() * y.get());
    if (currentDist < 10 || dragDuration < 200) {
      toggleTheme();
    }
  };

  if (!mounted) return null;

  const wireColor = isDark ? "#ffffff" : "#18181b";
  const bulbBg = isDark ? "#181822" : "#ffffff";
  const bulbBorder = isDark ? "#2d2d3d" : "#e4e4e7";

  return (
    <div
      className={`relative select-none pointer-events-none z-[999] flex flex-col items-center ${className}`}
      style={{ width: 64, height: stringLength + 60 }}
    >
      {/* Dynamic SVG wire linking top anchor directly to bulb center */}
      <svg
        className="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none z-[999]"
        style={{ width: 64, height: stringLength + 60 }}
      >
        {/* Top anchor bead */}
        <circle
          cx={anchorX}
          cy={2}
          r={3.5}
          fill={wireColor}
          className="transition-colors duration-300"
        />

        {/* The physical flexible string */}
        <motion.path
          d={path}
          stroke={wireColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={isDark ? "4 2" : "none"}
          className="transition-colors duration-300 opacity-80"
        />
      </svg>

      {/* 2D Draggable Bulb / Pendant Handle (Drag in X, Y, or click) */}
      <motion.div
        drag
        dragConstraints={{ top: 0, bottom: 180, left: -60, right: 60 }}
        dragElastic={0.25}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={handleHandleClick}
        animate={controls}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92, cursor: "grabbing" }}
        style={{
          x,
          y,
          position: "absolute",
          top: stringLength - 18,
          left: anchorX - 18,
          width: 36,
          height: 36,
          cursor: "grab",
          pointerEvents: "auto",
          zIndex: 999,
        }}
        className="group flex items-center justify-center z-[999]"
        title="Pull or drag in any direction to switch theme"
      >
        {/* Tactile Bulb Orb */}
        <div
          style={{
            backgroundColor: bulbBg,
            borderColor: bulbBorder,
          }}
          className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 shadow-lg transition-colors duration-300 group-hover:border-[#d4ff3a]"
        >
          {isDark ? (
            <Moon className="h-4 w-4 text-[#d4ff3a] transition-transform duration-300 group-hover:-rotate-12" />
          ) : (
            <Sun className="h-4 w-4 text-amber-500 transition-transform duration-300 group-hover:rotate-45" />
          )}

          {/* Subtle glow halo in dark mode */}
          {isDark && (
            <span className="absolute inset-0 rounded-full bg-[#d4ff3a] opacity-25 blur-sm pointer-events-none" />
          )}
        </div>

        {/* Micro guide pill on hover */}
        <span className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 dark:bg-white dark:text-zinc-950">
          {isDark ? "Switch to Light" : "Switch to Dark"}
        </span>
      </motion.div>
    </div>
  );
}
