import { useEffect, useState } from "react"
import { Link, Route, Routes } from "react-router-dom"

type VersionPayload = {
  version: string
  label: string
  nextStillPrimary?: boolean
}

/**
 * Shell Vite (fase 1). El POS completo sigue en Next hasta migrar pantalla por pantalla.
 */
export function App() {
  return (
    <Routes>
      <Route path="*" element={<MigrationHome />} />
    </Routes>
  )
}

function MigrationHome() {
  const [info, setInfo] = useState<VersionPayload | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/version")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<VersionPayload>
      })
      .then((data) => {
        if (!cancelled) setInfo(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Sin API")
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--pf-accent)]">Punto Fadey</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Migración a Vite</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Esta es la fase 1: cliente Vite + API Express en paralelo. En Render el sistema sigue sirviendo Next
          hasta migrar login, caja y el resto por partes.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-slate-400">Versión API</p>
        {info ? (
          <p className="mt-1 text-2xl font-semibold text-white">{info.label}</p>
        ) : error ? (
          <p className="mt-1 text-sm text-amber-300">API no conectada ({error}). Arranca con npm run dev:api</p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Consultando…</p>
        )}
        {info?.nextStillPrimary ? (
          <p className="mt-2 text-xs text-slate-500">Producción: Next sigue siendo el arranque en Render.</p>
        ) : null}
      </div>

      <ol className="space-y-2 text-sm text-slate-300">
        <li>1. API Express + health/version (listo)</li>
        <li>2. Login y sesión por API</li>
        <li>3. Caja / ventas / inventario por módulos</li>
        <li>4. Corte final: Render arranca Express + client/dist</li>
      </ol>

      <Link
        to="/"
        className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white"
      >
        Shell Vite activo
      </Link>
    </main>
  )
}
