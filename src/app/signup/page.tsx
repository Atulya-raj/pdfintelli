"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Lock, Mail, User, AlertCircle } from "lucide-react";
import PullStringThemeSwitch from "@/components/PullStringThemeSwitch";
import Loader from "@/components/Loader";
import Logo from "@/components/Logo";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (res.ok) {
        router.push("/login?success=true");
      } else {
        const data = await res.json();
        setError(data.message || "Something went wrong creating your account.");
      }
    } catch {
      setError("An unexpected network error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#fbfbf9] text-zinc-900 dark:bg-[#09090c] dark:text-zinc-100 p-4 transition-colors duration-400">
      {/* Ambient background glows */}
      <div className="sylven-ambient-glow -top-32 -left-32 h-96 w-96 bg-[#80e9ff] dark:bg-[#80e9ff]/10 pointer-events-none" />
      <div className="sylven-ambient-glow -top-20 -right-20 h-[450px] w-[450px] bg-[#d4ff3a] dark:bg-[#d4ff3a]/10 pointer-events-none" />

      {/* Hanging Pull-String Theme Switch (fixed top-right anchor) */}
      <div className="fixed top-0 right-4 sm:right-8 md:right-12 z-50 pointer-events-none">
        <PullStringThemeSwitch stringLength={70} />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-8 rounded-3xl border border-zinc-200/80 bg-white/80 p-8 shadow-2xl backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/80 transition-all">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-3">
            <Logo size={56} />
          </div>
          <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-zinc-500 block">
            PDF Intelligence
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white uppercase">
            Create Account
          </h2>
          <p className="text-xs text-zinc-500 font-mono">
            Start analyzing and searching your documents in seconds
          </p>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSignup}>
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            <div className="relative">
              <input
                id="name"
                name="name"
                type="text"
                required
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/50 py-3 pl-10 pr-4 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-[#d4ff3a] transition-all"
                placeholder="Full Name / Team Role"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                <User className="h-4 w-4" />
              </div>
            </div>

            <div className="relative">
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/50 py-3 pl-10 pr-4 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-[#d4ff3a] transition-all"
                placeholder="Work email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                <Mail className="h-4 w-4" />
              </div>
            </div>

            <div className="relative">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/50 py-3 pl-10 pr-4 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-[#d4ff3a] transition-all"
                placeholder="Secure password (min. 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                <Lock className="h-4 w-4" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 py-3 text-xs font-semibold uppercase tracking-wider text-white hover:bg-zinc-800 dark:bg-[#d4ff3a] dark:text-zinc-950 dark:hover:bg-[#c2ef2b] shadow-md transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader size="xs" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <span>Get Started</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>

          <div className="text-center pt-2">
            <Link
              href="/login"
              className="font-mono text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-[#d4ff3a] transition-colors"
            >
              Already have an account? <span className="underline font-semibold">Sign In</span>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
