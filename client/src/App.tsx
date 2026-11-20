import { useEffect, useState } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { getBootstrap, getMe, getPanelBootstrap, getVersion, isOfflineError, type PanelBootstrap } from "./api"
import { startOfflineSync } from "./offline"
import { OfflineTicketPage, SyncPage } from "./pages/OfflinePages"
import { Shell } from "./layout/Shell"
import { AdjustmentsPage } from "./pages/AdjustmentsPage"
import { AlertsPage } from "./pages/AlertsPage"
import { BarcodesPage } from "./pages/BarcodesPage"
import { BillingPage } from "./pages/BillingPage"
import { CashHistoryPage } from "./pages/CashHistoryPage"
import { CashPage } from "./pages/CashPage"
import { CatalogPage } from "./pages/CatalogPage"
import { CloseCashPage } from "./pages/CloseCashPage"
import { CreditsPage } from "./pages/CreditsPage"
import { CustomerHistoryPage } from "./pages/CustomerHistoryPage"
import { CustomersPage } from "./pages/CustomersPage"
import { DashboardPage } from "./pages/DashboardPage"
import { KardexPage } from "./pages/KardexPage"
import { LoginPage } from "./pages/LoginPage"
import { PendingPage } from "./pages/PendingPage"
import { PresentationsPage } from "./pages/PresentationsPage"
import { PricesPage } from "./pages/PricesPage"
import { ProductFormPage } from "./pages/ProductFormPage"
import { PurchaseHistoryPage } from "./pages/PurchaseHistoryPage"
import { ReceptionPage } from "./pages/ReceptionPage"
import { ReportsPage } from "./pages/ReportsPage"
import { RequirementPage } from "./pages/RequirementPage"
import { ReturnsPage } from "./pages/ReturnsPage"
import { SettingsPage } from "./pages/SettingsPage"
import { SaleDetailPage } from "./pages/SaleDetailPage"
import { SalesHistoryPage } from "./pages/SalesHistoryPage"
import { SalesPage } from "./pages/SalesPage"
import { SuppliersPage } from "./pages/SuppliersPage"
import { TicketPage } from "./pages/TicketPage"
import { TransfersPage } from "./pages/TransfersPage"
import { UnitsPage } from "./pages/UnitsPage"
import { WarehousesPage } from "./pages/WarehousesPage"

type Me = Awaited<ReturnType<typeof getMe>>

export function App() {
  const [ready, setReady] = useState(false)
  const [versionLabel, setVersionLabel] = useState("v…")
  const [me, setMe] = useState<Me | null>(null)
  const [panel, setPanel] = useState<PanelBootstrap | null>(null)
  const [bootError, setBootError] = useState("")

  useEffect(() => {
    let cancelled = false
    const BOOT_KEY = "pf-offline-boot-v1"
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
          try {
            localStorage.setItem(BOOT_KEY, JSON.stringify({ me: session, panel: panelData, versionLabel: version.label }))
          } catch {
            /* noop */
          }
          startOfflineSync()
        } catch (err) {
          if (isOfflineError(err)) throw err
          if (!cancelled) {
            setMe(null)
            setPanel(null)
          }
        }
      } catch (err) {
        // Sin conexión: abre con la última sesión guardada en este equipo para seguir vendiendo.
        let saved: { me: Me; panel: PanelBootstrap; versionLabel?: string } | null = null
        if (isOfflineError(err)) {
          try {
            saved = JSON.parse(localStorage.getItem(BOOT_KEY) ?? "null")
          } catch {
            saved = null
          }
        }
        if (saved?.me && saved.panel) {
          if (!cancelled) {
            setMe(saved.me)
            setPanel(saved.panel)
            if (saved.versionLabel) setVersionLabel(saved.versionLabel)
            startOfflineSync()
          }
        } else if (!cancelled) {
          setBootError(err instanceof Error ? err.message : "Sin API")
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[var(--pf-canvas)]">
        <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
          <span className="size-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-[var(--pf-accent)]" />
          Cargando Punto Fadey…
        </div>
      </div>
    )
  }

  if (bootError) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6 text-slate-200">
        <h1 className="text-xl font-semibold text-[var(--pf-navy)]">Sin conexión con el servidor</h1>
        <p className="text-sm text-slate-600">{bootError}</p>
        <p className="text-sm text-slate-500">
          Para usar Punto Fadey sin internet, entra al menos una vez con conexión en este equipo.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-11 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white"
        >
          Reintentar
        </button>
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
          <Route path="ventas/devoluciones" element={<ReturnsPage />} />
          <Route path="ventas/sincronizar" element={<SyncPage />} />
          <Route path="ventas/pendiente/:queueId" element={<OfflineTicketPage />} />
          <Route path="ventas/anulaciones" element={<SalesHistoryPage voidedOnly />} />
          <Route path="ventas/:saleId/ticket" element={<TicketPage />} />
          <Route path="ventas/:saleId" element={<SaleDetailPage />} />
          <Route path="caja" element={<CashPage />} />
          <Route path="caja/cierre" element={<CloseCashPage />} />
          <Route path="caja/historial" element={<CashHistoryPage />} />
          <Route path="productos" element={<CatalogPage />} />
          <Route path="productos/nuevo" element={<ProductFormPage />} />
          <Route path="productos/unidades" element={<UnitsPage />} />
          <Route path="productos/presentaciones" element={<PresentationsPage />} />
          <Route path="productos/codigos" element={<BarcodesPage />} />
          <Route path="productos/precios" element={<PricesPage />} />
          <Route path="productos/:productId" element={<ProductFormPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="clientes/historial" element={<CustomerHistoryPage />} />
          <Route path="clientes/creditos" element={<CreditsPage />} />
          <Route path="inventario/alertas" element={<AlertsPage />} />
          <Route path="inventario/almacenes" element={<WarehousesPage />} />
          <Route path="inventario/kardex" element={<KardexPage />} />
          <Route path="inventario/transferencias" element={<TransfersPage />} />
          <Route path="inventario/ajustes" element={<AdjustmentsPage />} />
          <Route path="compras/proveedores" element={<SuppliersPage />} />
          <Route path="compras/requerimiento" element={<RequirementPage />} />
          <Route path="compras/recepcion" element={<ReceptionPage />} />
          <Route path="compras/historial" element={<PurchaseHistoryPage />} />
          <Route path="facturacion" element={<BillingPage />} />
          <Route path="informes" element={<ReportsPage />} />
          <Route path="configuracion" element={<SettingsPage />} />
          <Route path="pendiente/*" element={<PendingPage />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}

      <Route path="*" element={<Navigate to={me ? "/" : "/login"} replace />} />
    </Routes>
  )
}
