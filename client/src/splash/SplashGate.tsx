import { useCallback, useState, type ReactNode } from "react"
import { PuntoFadeyEntrySplash } from "./EntrySplash"
import { markEntrySplashDone, shouldSkipEntrySplash } from "./session"

/**
 * Animación de apertura (logo, circuitos, sonido y crédito Fadey Solutions SAC).
 * Cubre la app al abrir o recargar, antes del login; la app carga por debajo mientras tanto.
 */
export function SplashGate({ children }: { children: ReactNode }) {
  const [showSplash, setShowSplash] = useState(() => !shouldSkipEntrySplash())

  const handleComplete = useCallback(() => {
    markEntrySplashDone()
    setShowSplash(false)
  }, [])

  return (
    <>
      {children}
      {showSplash ? <PuntoFadeyEntrySplash onComplete={handleComplete} logoSrc="/brand/punto-fadey.jpg" /> : null}
    </>
  )
}
