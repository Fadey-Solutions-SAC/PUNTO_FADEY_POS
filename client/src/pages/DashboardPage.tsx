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
        <Link to="/ventas" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[var(--pf-accent)]">
          <p className="text-sm font-semibold text-[var(--pf-navy)]">Venta rápida</p>
          <p className="mt-1 text-sm text-slate-500">Buscar productos y cobrar en efectivo.</p>
        </Link>
        <Link to="/caja" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[var(--pf-accent)]">
          <p className="text-sm font-semibold text-[var(--pf-navy)]">Caja</p>
          <p className="mt-1 text-sm text-slate-500">Apertura, movimientos, cierre y arqueo.</p>
        </Link>
      </div>
    </div>
  )
}
