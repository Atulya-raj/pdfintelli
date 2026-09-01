"use client";

import { useEffect } from "react";

/**
 * Production-grade resilience against Webpack/Next.js ChunkLoadErrors.
 * If a deployed chunk is outdated, server was recompiled, or connection dropped during
 * code-splitting fetch, this intercepts the error and seamlessly reloads the latest bundle.
 */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    function isChunkError(err: any): boolean {
      const msg = err?.message || String(err || "");
      const name = err?.name || "";
      return (
        name === "ChunkLoadError" ||
        msg.includes("ChunkLoadError") ||
        /Loading chunk .* failed/i.test(msg) ||
        /Loading CSS chunk .* failed/i.test(msg)
      );
    }

    function handleReload() {
      const now = Date.now();
      const lastReload = parseInt(sessionStorage.getItem("last_chunk_reload") || "0", 10);
      // Debounce reload: avoid infinite loops if an asset is genuinely absent
      if (now - lastReload > 8000) {
        sessionStorage.setItem("last_chunk_reload", String(now));
        console.warn("[ChunkLoadRecovery] Stale chunk detected, refreshing page...");
        window.location.reload();
      }
    }

    function errorHandler(event: ErrorEvent) {
      if (isChunkError(event.error || event.message)) {
        event.preventDefault();
        handleReload();
      }
    }

    function rejectionHandler(event: PromiseRejectionEvent) {
      if (isChunkError(event.reason)) {
        event.preventDefault();
        handleReload();
      }
    }

    window.addEventListener("error", errorHandler);
    window.addEventListener("unhandledrejection", rejectionHandler);

    return () => {
      window.removeEventListener("error", errorHandler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, []);

  return null;
}
