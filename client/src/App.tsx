import { useEffect, useState } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { getBootstrap, getMe, getVersion } from "./api"
import { HomePage } from "./pages/HomePage"
import { LoginPage } from "./pages/LoginPage"

type Me = Awaited<ReturnType<typeof getMe>>

export function App() {
  const [ready, setReady] = useState(false)
  const [versionLabel, setVersionLabel] = useState("v…")
  const [me, setMe] = useState<Me | null>(null)
  const [bootError, setBootError] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [version, bootstrap] = await Promise.all([getVersion(), getBootstrap()])
        if (cancelled) return
        setVersionLabel(version.label || bootstrap.version)
        try {
          const session = await getMe()
          if (!cancelled) setMe(session)
        } catch {
          if (!cancelled) setMe(null)
        }
      } catch (err) {
        if (!cancelled) setBootError(err instanceof Error ? err.message : "Sin API")
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return <div className="fixed inset-0 grid place-items-center bg-black text-sm text-slate-400">Cargando…</div>
  }

  if (bootError) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6 text-slate-200">
        <h1 className="text-xl font-semibold">API no disponible</h1>
        <p className="text-sm text-slate-400">{bootError}</p>
        <p className="text-sm text-slate-500">Arranca con npm run dev:api (o npm run dev:stack).</p>
      </main>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          me ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage
              versionLabel={versionLabel}
              onSuccess={async () => {
                setMe(await getMe())
              }}
            />
          )
        }
      />
      <Route path="/" element={me ? <HomePage me={me} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={me ? "/" : "/login"} replace />} />
    </Routes>
  )
}
