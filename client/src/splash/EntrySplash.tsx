
import { EntrySplashCircuits } from "./EntrySplashCircuits";
import "./entry-splash.css";
import {
  isEntrySplashDone,
  markEntrySplashDone,
  markEntrySplashStarted,
} from "./session";
import { playSplashSound } from "./sound";
import { useCallback, useEffect, useRef, useState } from "react";

const SPLASH_HOLD_MS = 3000;
const SPLASH_EXIT_MS = 450;

let splashAnimationStarted = false;

/**
 * Pantalla splash al abrir / recargar (misma animación que Resto Fadey).
 * Logo Punto Fadey + circuitos + crédito Fadey Solutions SAC.
 */
export function PuntoFadeyEntrySplash({
  onComplete,
  logoSrc = "/brand/punto-fadey.jpg",
}: {
  onComplete: () => void;
  logoSrc?: string;
}) {
  const [phase, setPhase] = useState<"in" | "out">("in");
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finishSplash = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    markEntrySplashDone();
    onCompleteRef.current?.();
  }, []);

  useEffect(() => {
    if (isEntrySplashDone()) {
      finishSplash();
      return undefined;
    }

    if (!splashAnimationStarted) {
      splashAnimationStarted = true;
      markEntrySplashStarted();
      playSplashSound();
    }
    setPhase("in");

    const holdTimer = setTimeout(() => setPhase("out"), SPLASH_HOLD_MS);
    return () => clearTimeout(holdTimer);
  }, [finishSplash]);

  useEffect(() => {
    if (phase !== "out") return undefined;
    const exitTimer = setTimeout(finishSplash, SPLASH_EXIT_MS);
    return () => clearTimeout(exitTimer);
  }, [phase, finishSplash]);

  if (completedRef.current) {
    return null;
  }

  return (
    <div
      className={`rf-entry-splash${phase === "out" ? " rf-entry-splash--out" : ""}`}
      style={{ backgroundColor: "#000000" }}
      role="presentation"
      aria-hidden="true"
    >
      <EntrySplashCircuits />
      <div className="rf-entry-splash__stage">
        <div className={`rf-entry-splash__stack${phase === "out" ? " rf-entry-splash__stack--out" : ""}`}>
          <div className="rf-entry-splash__logo-wrap">
            <div className="rf-entry-splash__glow" aria-hidden />
            <div className="rf-entry-splash__logo-ring">
              <img
                src={logoSrc}
                alt=""
                className="rf-entry-splash__logo-img"
                width={512}
                height={512}
                decoding="async"
                fetchPriority="high"
              />
              <span className="rf-entry-splash__shine" aria-hidden />
            </div>
          </div>
        </div>
      </div>
      <p className="rf-entry-splash__credit">Fadey Solutions SAC</p>
    </div>
  );
}
