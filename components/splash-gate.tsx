"use client";

import { PuntoFadeyEntrySplash } from "@/components/entry-splash";
import { markEntrySplashDone, shouldSkipEntrySplash } from "@/lib/entry-splash-session";
import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * Cubre la app con el splash sin omitir `{children}` (Cache Components / Instant Navigation).
 */
export function SplashGate({ children, logoSrc }: { children: ReactNode; logoSrc?: string | null }) {
  const [ready, setReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    setShowSplash(!shouldSkipEntrySplash());
    setReady(true);
  }, []);

  const handleComplete = useCallback(() => {
    markEntrySplashDone();
    setShowSplash(false);
  }, []);

  return (
    <>
      {children}
      {ready && showSplash ? (
        <PuntoFadeyEntrySplash onComplete={handleComplete} logoSrc={logoSrc || "/brand/punto-fadey.jpg"} />
      ) : null}
      {!ready ? <div className="fixed inset-0 z-[200] bg-black" aria-hidden="true" /> : null}
    </>
  );
}
