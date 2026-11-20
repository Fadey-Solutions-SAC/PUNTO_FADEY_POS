import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  PackageX,
  Receipt,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { getDashboard, type DashboardPayload, type PanelBootstrap } from "../api"
import { PALETTE, payColor, tint } from "../colors"

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
      const stop = `${payColor(method)} ${cursor}% ${next}%`
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


  if (error) {
    return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="h-14 w-72 animate-pulse rounded-xl bg-slate-200/60" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      </div>
    )
  }

  const salesTrend = change(data.salesTotal.cents, data.yesterdaySales.cents)
  const opsTrend = change(data.operations, data.yesterdayOperations)
  const payTotal = Object.values(data.payMix).reduce((sum, value) => sum + value.cents, 0)
  const maxDay = Math.max(...data.days.map((day) => Math.max(day.total.cents, 0)), 1)
  const hasSalesChart = data.days.some((day) => day.total.cents !== 0)

  const cards: { label: string; value: string; trend: ReturnType<typeof change>; color: string; icon: LucideIcon; href?: string }[] = [
    { label: "Ventas del día", value: data.salesTotal.label, trend: salesTrend, color: "#0d9488", icon: TrendingUp },
    { label: "Operaciones", value: String(data.operations), trend: opsTrend, color: "#6366f1", icon: Receipt },
    { label: "Ingresos de caja", value: data.income.label, trend: null, color: "#10b981", icon: ArrowDownCircle },
    { label: "Egresos de caja", value: data.expense.label, trend: null, color: "#ef4444", icon: ArrowUpCircle },
    { label: "Ganancia estimada", value: data.profit.label, trend: null, color: "#8b5cf6", icon: Wallet },
    { label: "Productos", value: String(data.products), trend: null, color: "#0ea5e9", icon: Boxes, href: "/productos" },
    { label: "Stock bajo", value: String(data.low), trend: null, color: "#f59e0b", icon: AlertTriangle, href: "/inventario/alertas" },
    { label: "Agotados", value: String(data.empty), trend: null, color: "#e11d48", icon: PackageX, href: "/inventario/alertas" },
  ]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches"
  const today = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-[#eef2f7] px-5 py-4 shadow-sm ring-1 ring-slate-200/70 sm:px-7 sm:py-5">
        <div className="flex items-start justify-between gap-3 text-sm text-slate-500 sm:text-base">
          <p className="min-w-0 truncate uppercase tracking-wide">{panel.business.name}</p>
          <p className="shrink-0 tabular-nums">{today}</p>
        </div>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-[var(--pf-navy)] sm:text-4xl">
          {greeting}, {panel.user.name}
        </h1>
        <p className="mt-1 text-base text-slate-500 sm:text-lg">Te damos la bienvenida a tu panel de gestión.</p>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon
          const hero = index === 0
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm ${hero ? "text-white/80" : "text-slate-500"}`}>{card.label}</p>
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                  style={{ background: hero ? "rgba(255,255,255,0.18)" : card.color }}
                >
                  <Icon size={17} strokeWidth={2.2} />
                </span>
              </div>
              <p
                className="mt-1 text-2xl font-bold tracking-tight tabular-nums sm:text-[1.7rem]"
                style={{ color: hero ? "#fff" : card.color }}
              >
                {card.value}
              </p>
              {card.trend ? (
                <span
                  className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    hero ? "bg-white/20 text-white" : card.trend.up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {card.trend.up ? "▲" : "▼"} {card.trend.text} vs. ayer
                </span>
              ) : null}
            </>
          )
          const cls = "relative block overflow-hidden rounded-2xl border p-4 shadow-sm"
          const style = hero
            ? { background: `linear-gradient(135deg, ${card.color}, #0ea5e9)`, borderColor: "transparent" }
            : { background: `linear-gradient(180deg, ${tint(card.color, 0.07)}, #fff 70%)`, borderColor: tint(card.color, 0.35) }
          return card.href ? (
            <Link key={card.label} to={card.href} className={`${cls} transition hover:-translate-y-0.5 hover:shadow-md`} style={style}>
              {body}
            </Link>
          ) : (
            <div key={card.label} className={cls} style={style}>
              {body}
            </div>
          )
        })}
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
            <div className="mt-4 flex h-48 items-end gap-2">
              {data.days.map((day, index) => {
                const today = index === data.days.length - 1
                const color = today ? "#f59e0b" : PALETTE[index % PALETTE.length]
                const pct = Math.max(day.total.cents > 0 ? 8 : 2, (Math.max(day.total.cents, 0) / maxDay) * 100)
                return (
                  <div key={day.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${day.label}: ${day.total.label}`}>
                    <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums" style={{ color: day.total.cents > 0 ? color : "transparent" }}>
                      {day.total.cents > 0 ? day.total.label.replace("S/ ", "") : "·"}
                    </span>
                    <div
                      className={`w-full rounded-t-xl transition-all duration-500 group-hover:brightness-110 ${today ? "ring-2 ring-amber-300 ring-offset-1" : ""}`}
                      style={{
                        height: `${pct}%`,
                        background: day.total.cents > 0 ? `linear-gradient(180deg, ${color}, ${tint(color, 0.55)})` : "#e2e8f0",
                      }}
                    />
                    <span className={`text-[11px] capitalize ${today ? "font-bold text-amber-600" : "text-slate-500"}`}>
                      {today ? "Hoy" : day.label.replace(".", "")}
                    </span>
                  </div>
                )
              })}
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
                    <div className="flex justify-between font-bold text-emerald-700">
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
                <div className="grid size-[4.5rem] place-items-center rounded-full bg-white text-center shadow-inner">
                  <span className="text-[10px] leading-tight text-slate-500">
                    Total
                    <br />
                    <span className="text-sm font-bold tabular-nums text-[var(--pf-navy)]">{(payTotal / 100).toFixed(2)}</span>
                  </span>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {Object.entries(data.payMix)
                  .filter(([, value]) => value.cents > 0)
                  .map(([method, value]) => (
                    <li key={method} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: payColor(method) }} />
                      <span className="flex-1">{value.label}</span>
                      <span className="font-semibold tabular-nums" style={{ color: payColor(method) }}>
                        {Math.round((value.cents / payTotal) * 100)}%
                      </span>
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
                  <span className="shrink-0 rounded-lg bg-teal-50 px-2 py-0.5 font-semibold tabular-nums text-teal-700">{sale.total.label}</span>
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
                  <span
                    className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      Number.parseFloat(item.quantityLabel) <= 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
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
                  <span className="shrink-0 rounded-lg bg-indigo-50 px-2 py-0.5 font-semibold tabular-nums text-indigo-700">{purchase.total.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
