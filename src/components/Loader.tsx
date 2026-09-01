"use client";

import React, { useId } from "react";

export interface LoaderProps {
  /**
   * Preset size or custom pixel size:
   * "xs" = 18px, "sm" = 28px, "md" = 52px, "lg" = 80px, or a custom number (px)
   */
  size?: "xs" | "sm" | "md" | "lg" | number;
  /**
   * Color variant:
   * "brand" (default: emerald/obsidian in light mode, vibrant lime/emerald in dark mode)
   * "amber" (warm gold/amber gradient)
   */
  variant?: "brand" | "amber";
  /**
   * Optional label shown beneath the loader
   */
  label?: string;
  className?: string;
}

export default function Loader({
  size = "md",
  variant = "brand",
  label,
  className = "",
}: LoaderProps) {
  const reactId = useId();
  const gradientId = `loader-grad-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  let pxSize = 52;
  if (typeof size === "number") {
    pxSize = size;
  } else {
    switch (size) {
      case "xs":
        pxSize = 18;
        break;
      case "sm":
        pxSize = 28;
        break;
      case "lg":
        pxSize = 76;
        break;
      case "md":
      default:
        pxSize = 52;
        break;
    }
  }

  const isSmall = pxSize <= 24;

  return (
    <div
      className={`inline-flex flex-col items-center justify-center ${className}`}
      role="status"
      aria-label="Loading"
    >
      <div
        className="relative flex items-center justify-center"
        style={{ width: `${pxSize}px`, height: `${pxSize}px` }}
      >
        <svg
          className="animate-spin"
          style={{ animationDuration: "1.4s" }}
          width={pxSize}
          height={pxSize}
          viewBox="0 0 50 50"
          fill="none"
        >
          <defs>
            {variant === "amber" ? (
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
            ) : (
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" className="dark:stop-color-[#d4ff3a]" />
                <stop offset="100%" stopColor="#059669" className="dark:stop-color-[#10b981]" />
              </linearGradient>
            )}
          </defs>

          {/* Background subtle ring */}
          <circle
            cx="25"
            cy="25"
            r="20"
            stroke="currentColor"
            strokeWidth="4"
            className="text-zinc-200 dark:text-zinc-800/80"
          />

          {/* Active spinning arc with gradient */}
          <circle
            cx="25"
            cy="25"
            r="20"
            stroke={`url(#${gradientId})`}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="90 150"
          />
        </svg>

        {/* Pulsing inner dot for medium and large loaders */}
        {!isSmall && (
          <div
            className={`absolute rounded-full animate-ping opacity-60 ${
              variant === "amber"
                ? "bg-amber-500"
                : "bg-emerald-600 dark:bg-[#d4ff3a]"
            }`}
            style={{
              width: `${Math.max(pxSize * 0.25, 6)}px`,
              height: `${Math.max(pxSize * 0.25, 6)}px`,
              animationDuration: "2s",
            }}
          />
        )}
      </div>

      {label && (
        <p className="mt-3 text-xs font-mono text-zinc-600 dark:text-zinc-400 animate-pulse text-center leading-normal">
          {label}
        </p>
      )}
    </div>
  );
}
