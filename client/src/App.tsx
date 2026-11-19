import { useEffect, useState } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { getBootstrap, getMe, getPanelBootstrap, getVersion, type PanelBootstrap } from "./api"
import { Shell } from "./layout/Shell"
import { CashHistoryPage } from "./pages/CashHistoryPage"
import { CashPage } from "./pages/CashPage"
import { CatalogPage } from "./pages/CatalogPage"
import { CloseCashPage } from "./pages/CloseCashPage"
import { DashboardPage } from "./pages/DashboardPage"
import { LoginPage } from "./pages/LoginPage"
import { PendingPage } from "./pages/PendingPage"
import { SaleDetailPage } from "./pages/SaleDetailPage"
import { SalesHistoryPage } from "./pages/SalesHistoryPage"
import { SalesPage } from "./pages/SalesPage"
import { TicketPage } from "./pages/TicketPage"

type Me = Awaited<ReturnType<typeof getMe>>

export function App() {
  const [ready, setReady] = useState(false)
  const [versionLabel, setVersionLabel] = useState("v…")
  const [me, setMe] = useState<Me | null>(null)
  const [panel, setPanel] = useState<PanelBootstrap | null>(null)
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
          if (cancelled) return
          setMe(session)
          const panelData = await getPanelBootstrap()
          if (!cancelled) setPanel(panelData)
        } catch {
          if (!cancelled) {
            setMe(null)
            setPanel(null)
          }
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
                const session = await getMe()
                setMe(session)
                setPanel(await getPanelBootstrap())
              }}
            />
          )
        }
      />

      {me && panel ? (
        <Route element={<Shell panel={panel} />}>
          <Route index element={<DashboardPage panel={panel} />} />
          <Route path="ventas" element={<SalesPage />} />
          <Route path="ventas/historial" element={<SalesHistoryPage />} />
          <Route path="ventas/:saleId/ticket" element={<TicketPage />} />
          <Route path="ventas/:saleId" element={<SaleDetailPage />} />
          <Route path="caja" element={<CashPage />} />
          <Route path="caja/cierre" element={<CloseCashPage />} />
          <Route path="caja/historial" element={<CashHistoryPage />} />
          <Route path="productos" element={<CatalogPage />} />
          <Route path="pendiente/*" element={<PendingPage />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}

      <Route path="*" element={<Navigate to={me ? "/" : "/login"} replace />} />
    </Routes>
  )
}
