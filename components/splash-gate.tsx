"use client";

import { PuntoFadeyEntrySplash } from "@/components/entry-splash";
import { markEntrySplashDone, shouldSkipEntrySplash } from "@/lib/entry-splash-session";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export function SplashGate({ children, logoSrc }: { children: ReactNode; logoSrc?: string | null }) {
  const [ready, setReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    setSplashDone(shouldSkipEntrySplash());
    setReady(true);
  }, []);

  const handleComplete = useCallback(() => {
    markEntrySplashDone();
    setSplashDone(true);
  }, []);

  if (!ready) {
    return <div className="fixed inset-0 z-[200] bg-black" aria-hidden="true" />;
  }

  if (!splashDone) {
    return <PuntoFadeyEntrySplash onComplete={handleComplete} logoSrc={logoSrc || "/brand/punto-fadey.jpg"} />;
  }

  return children;
}
