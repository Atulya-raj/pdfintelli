"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, ArrowLeft, User } from "lucide-react";
import PullStringThemeSwitch from "@/components/PullStringThemeSwitch";
import Loader from "@/components/Loader";
import Logo from "@/components/Logo";

export default function SignOutPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut({ callbackUrl: "/login" });
    } catch (err) {
      console.error("Sign out error:", err);
      setIsSigningOut(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-300">
      {/* Hanging Pull-String Theme Switch (fixed top-right anchor) */}
      <div className="fixed top-0 right-4 sm:right-8 md:right-12 z-50 pointer-events-none">
        <PullStringThemeSwitch stringLength={70} />
      </div>

      {/* Ambient background glows */}
      <div className="sylven-ambient-glow -top-40 -left-40 h-96 w-96 bg-emerald-500/20 dark:bg-[#d4ff3a]/15" />
      <div className="sylven-ambient-glow -bottom-40 -right-40 h-96 w-96 bg-cyan-500/20 dark:bg-[#10b981]/15" />

      {/* Top Header Bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
        <Link href="/" className="group flex items-center gap-3">
          <Logo size={40} />
          <div>
            <span className="font-extrabold tracking-tight text-sm uppercase block">
              PDF Intelligence
            </span>
            <p className="text-[10px] text-[var(--text-muted)] font-mono">
              Document Workspace
            </p>
          </div>
        </Link>

        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border-main)] bg-[var(--surface-card)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors shadow-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      </header>

      {/* Main Signout Confirmation Card */}
      <main className="relative z-10 flex flex-1 items-center justify-center p-4">
        <div className="app-card w-full max-w-md rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative border border-[var(--border-main)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-300">
          {/* Fluid Geometric Kaleidoscope Loader Showcase */}
          <div className="flex flex-col items-center justify-center pt-2">
            <Loader size="lg" />
          </div>

          {/* Heading */}
          <div className="text-center space-y-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text-main)]">
              Sign Out
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed max-w-xs mx-auto">
              Are you sure you want to sign out? Your work will be saved.
            </p>
          </div>

          {/* Active Account Details */}
          {session?.user && (
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--surface-subtle)] p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white font-bold text-xs dark:bg-white dark:text-zinc-950">
                  {session.user.name ? session.user.name[0].toUpperCase() : <User className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-main)] truncate">
                    {session.user.name || "Authenticated User"}
                  </p>
                  <p className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                    {session.user.email}
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-600 dark:text-[#d4ff3a] shrink-0 pl-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-[#d4ff3a] animate-pulse" />
                Active
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2.5 pt-2">
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-rose-700 shadow-md transition-all disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
            >
              {isSigningOut ? (
                <>
                  <Loader size="xs" />
                  <span>Signing out...</span>
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </>
              )}
            </button>

            <button
              onClick={() => router.push("/")}
              disabled={isSigningOut}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border-main)] bg-[var(--surface-subtle)] py-2.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-card)] transition-all disabled:opacity-50"
            >
              <span>Cancel</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-[11px] font-mono text-[var(--text-muted)]">
        PDF Intelligence
      </footer>
    </div>
  );
}
