import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getDashboard, type DashboardPayload, type PanelBootstrap } from "../api"

const PAY_COLORS: Record<string, string> = {
  CASH: "#148a84",
  CARD: "#0c2340",
  TRANSFER: "#b45309",
  OTHER: "#64748b",
  CREDIT: "#0f5f73",
}

function change(current: number, previous: number) {
  if (previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  const rounded = Math.abs(pct).toFixed(1)
  return { up: pct >= 0, text: `${pct >= 0 ? "+" : "−"}${rounded}%` }
}

function conic(mix: DashboardPayload["payMix"], total: number) {
  let cursor = 0
  const stops = Object.entries(mix)
    .filter(([, value]) => value.cents > 0)
    .map(([method, value]) => {
      const next = cursor + (value.cents / total) * 100
      const stop = `${PAY_COLORS[method] ?? "#94a3b8"} ${cursor}% ${next}%`
      cursor = next
      return stop
    })
  return `conic-gradient(${stops.join(", ")})`
}

export function DashboardPage({ panel }: { panel: PanelBootstrap }) {
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState("")
  const perms = panel.permissions

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudo cargar el panel"))
  }, [])

  const shortcuts = [
    perms.sell ? { href: "/ventas", label: "Nueva venta" } : null,
    perms.cash ? { href: "/caja", label: "Caja" } : null,
    perms.catalogWrite ? { href: "/productos/nuevo", label: "Registrar producto" } : null,
    perms.purchases ? { href: "/compras/recepcion", label: "Registrar compra" } : null,
  ].filter((item): item is { href: string; label: string } => item !== null)

  if (error) {
    return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
  }

  if (!data) {
    return <p className="text-sm text-slate-500">Cargando panel…</p>
  }

  const salesTrend = change(data.salesTotal.cents, data.yesterdaySales.cents)
  const opsTrend = change(data.operations, data.yesterdayOperations)
  const payTotal = Object.values(data.payMix).reduce((sum, value) => sum + value.cents, 0)
  const maxDay = Math.max(...data.days.map((day) => Math.max(day.total.cents, 0)), 1)
  const hasSalesChart = data.days.some((day) => day.total.cents !== 0)

  const cards = [
    { label: "Ventas del día", value: data.salesTotal.label, trend: salesTrend, tone: "text-[var(--pf-accent)]" },
    { label: "Operaciones", value: String(data.operations), trend: opsTrend, tone: "text-[var(--pf-navy)]" },
    { label: "Ingresos", value: data.income.label, trend: null, tone: "text-emerald-700" },
    { label: "Egresos", value: data.expense.label, trend: null, tone: "text-red-700" },
    { label: "Ganancia estimada", value: data.profit.label, trend: null, tone: "text-[var(--pf-navy)]" },
    { label: "Productos", value: String(data.products), trend: null, tone: "text-[var(--pf-navy)]" },
    { label: "Stock bajo", value: String(data.low), trend: null, tone: "text-amber-700" },
    { label: "Agotados", value: String(data.empty), trend: null, tone: "text-red-700" },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Panel principal</h1>
        <p className="mt-1 text-sm text-slate-500">
          Hola, {panel.user.name}. Sucursal {panel.branch.name} · almacén {panel.warehouse.name}.
        </p>
      </div>

      {shortcuts.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shortcuts.map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className="inline-flex h-11 shrink-0 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[var(--pf-navy)] shadow-sm"
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${card.tone}`}>{card.value}</p>
            {card.trend ? (
              <p className={`mt-1 text-xs font-medium ${card.trend.up ? "text-emerald-700" : "text-red-700"}`}>
                {card.trend.text} vs. ayer
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)_minmax(16rem,0.8fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-[var(--pf-navy)]">Ventas de los últimos 7 días</h2>
            {perms.reports ? (
              <Link to="/informes" className="text-sm text-[var(--pf-accent)] hover:underline">
                Informes
              </Link>
            ) : null}
          </div>
          {hasSalesChart ? (
            <div className="mt-4 flex h-44 items-end gap-2">
              {data.days.map((day) => (
                <div key={day.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] text-slate-400">{day.total.cents > 0 ? day.total.label : ""}</span>
                  <div
                    className="w-full rounded-t-lg bg-[var(--pf-accent)]/90"
                    style={{ height: `${Math.max(day.total.cents > 0 ? 8 : 2, (Math.max(day.total.cents, 0) / maxDay) * 100)}%` }}
                  />
                  <span className="text-[11px] capitalize text-slate-500">{day.label.replace(".", "")}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-8 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Aún no hay ventas en los últimos 7 días.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--pf-navy)]">Estado de caja</h2>
            {perms.sell || perms.cash ? (
              <Link to="/caja" className="text-sm text-[var(--pf-accent)] hover:underline">
                Caja
              </Link>
            ) : null}
          </div>
          {data.openBoxes.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No hay cajas abiertas.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.openBoxes.map((box) => (
                <li key={box.id} className="rounded-xl bg-slate-50 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-[var(--pf-navy)]">{box.registerName}</p>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Abierta</span>
                  </div>
                  <p className="text-xs text-slate-500">{box.userName}</p>
                  <dl className="mt-2 space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <dt>Efectivo inicial</dt>
                      <dd>{box.opening.label}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Ventas en efectivo</dt>
                      <dd>{box.cashSales.label}</dd>
                    </div>
                    <div className="flex justify-between font-semibold text-[var(--pf-navy)]">
                      <dt>Saldo esperado</dt>
                      <dd>{box.expected.label}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-[var(--pf-navy)]">Ventas por medio de pago</h2>
          <p className="text-xs text-slate-500">Cobros de las ventas completadas hoy.</p>
          {payTotal <= 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">Hoy todavía no hay cobros.</p>
          ) : (
            <div className="mt-4 flex items-center gap-4">
              <div className="grid size-28 shrink-0 place-items-center rounded-full" style={{ background: conic(data.payMix, payTotal) }}>
                <div className="grid size-16 place-items-center rounded-full bg-white text-center">
                  <span className="text-[10px] leading-tight text-slate-500">
                    Total
                    <br />
                    {(payTotal / 100).toFixed(2)}
                  </span>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {Object.entries(data.payMix)
                  .filter(([, value]) => value.cents > 0)
                  .map(([method, value]) => (
                    <li key={method} className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: PAY_COLORS[method] }} />
                      <span className="flex-1">{value.label}</span>
                      <span>{Math.round((value.cents / payTotal) * 100)}%</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-[var(--pf-navy)]">Últimas ventas</h2>
            {perms.sell ? (
              <Link to="/ventas/historial" className="text-sm text-[var(--pf-accent)] hover:underline">
                Ver más
              </Link>
            ) : null}
          </div>
          {data.lastSales.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">Todavía no hay ventas.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.lastSales.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    {perms.sell || perms.reports ? (
                      <Link to={`/ventas/${sale.id}`} className="font-medium text-[var(--pf-navy)] hover:underline">
                        {sale.code}
                      </Link>
                    ) : (
                      <span className="font-medium">{sale.code}</span>
                    )}
                    <p className="truncate text-xs text-slate-500">{sale.customerName}</p>
                  </div>
                  <span className="shrink-0">{sale.total.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-[var(--pf-navy)]">Productos con stock bajo</h2>
            <Link to="/inventario/alertas" className="text-sm text-[var(--pf-accent)] hover:underline">
              Ver todos
            </Link>
          </div>
          {data.attention.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No hay alertas de stock.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.attention.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate font-medium text-[var(--pf-navy)]">{item.name}</span>
                  <span className="shrink-0 text-slate-500">
                    {item.quantityLabel} / mín. {item.minStockLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-[var(--pf-navy)]">Compras recientes</h2>
            {perms.purchases ? (
              <Link to="/compras/historial" className="text-sm text-[var(--pf-accent)] hover:underline">
                Ver todas
              </Link>
            ) : null}
          </div>
          {data.lastPurchases.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">Todavía no hay compras.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.lastPurchases.map((purchase) => (
                <li key={purchase.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{purchase.supplierName}</span>
                  <span className="shrink-0 text-slate-600">{purchase.total.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
