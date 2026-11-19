import { Link } from "react-router-dom"
import type { PanelBootstrap } from "../api"

export function DashboardPage({ panel }: { panel: PanelBootstrap }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Panel principal</h1>
        <p className="mt-1 text-sm text-slate-500">
          Hola, {panel.user.name}. Sucursal {panel.branch.name} · almacén {panel.warehouse.name}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/caja" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[var(--pf-accent)]">
          <p className="text-sm font-semibold text-[var(--pf-navy)]">Caja</p>
          <p className="mt-1 text-sm text-slate-500">Abrir caja, ver esperado y registrar movimientos.</p>
        </Link>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4">
          <p className="text-sm font-semibold text-slate-600">Ventas / inventario</p>
          <p className="mt-1 text-sm text-slate-500">Se migran en las siguientes fases. En Render el POS completo sigue en Next.</p>
        </div>
      </div>
    </div>
  )
}
