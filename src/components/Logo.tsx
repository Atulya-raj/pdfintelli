import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  variant?: "default" | "framed" | "raw";
  badgeText?: string;
}

/**
 * PDF Intelligence Brand Logo
 * Clean, modern, high-precision mark without artificial blur or glow effects.
 */
export function Logo({
  size = 32,
  className = "",
  showText = false,
  variant = "default",
  badgeText,
}: LogoProps) {
  // If framed variant is requested, wrap in a subtle refined squircle container
  if (variant === "framed") {
    return (
      <div className={`inline-flex items-center gap-3 select-none ${className}`}>
        <div
          className="relative flex items-center justify-center shrink-0 rounded-2xl bg-white dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] p-1.5 transition-transform duration-200 ease-out hover:scale-105 active:scale-95"
          style={{ width: size, height: size }}
        >
          <svg
            viewBox="75 80 350 350"
            width="100%"
            height="100%"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
          >
            <image href="/logo.png" x="0" y="0" width="500" height="500" />
          </svg>
        </div>
        {showText && (
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-zinc-900 dark:text-white text-base leading-tight">
                PDF Intelligence
              </span>
              {badgeText && (
                <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                  {badgeText}
                </span>
              )}
            </div>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              Document Workspace
            </span>
          </div>
        )}
      </div>
    );
  }

  // Default clean mark with crisp dimensions and subtle hover feedback
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <div
        className="relative flex items-center justify-center shrink-0 transition-transform duration-200 ease-out hover:scale-105 active:scale-95"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="75 80 350 350"
          width={size}
          height={size}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
        >
          <image href="/logo.png" x="0" y="0" width="500" height="500" />
        </svg>
      </div>
      {showText && (
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-tight text-zinc-900 dark:text-white leading-none">
            PDF Intelligence
          </span>
          {badgeText && (
            <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50">
              {badgeText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default Logo;
