import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Boxes,
  Download,
  PiggyBank,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { getReport, type ReportData, type ReportTone } from "../api"
import { PALETTE, tint } from "../colors"

const AREAS: { id: string; title: string; text: string; icon: LucideIcon; color: string }[] = [
  { id: "ventas", title: "Ventas", text: "Ingresos, operaciones, productos y medios de pago.", icon: TrendingUp, color: "#0d9488" },
  { id: "rentabilidad", title: "Rentabilidad", text: "Costo de lo vendido, mermas, utilidad y margen.", icon: PiggyBank, color: "#8b5cf6" },
  { id: "compras", title: "Compras", text: "Proveedores, documentos y cuentas por pagar.", icon: Truck, color: "#6366f1" },
  { id: "inventario", title: "Inventario", text: "Existencias, valor y movimientos de stock.", icon: Boxes, color: "#0ea5e9" },
  { id: "caja", title: "Caja", text: "Cobros por medio, movimientos y cierres.", icon: Wallet, color: "#10b981" },
  { id: "clientes", title: "Clientes", text: "Mejores clientes y saldos a crédito.", icon: Users, color: "#f59e0b" },
]

const GROUPS: Record<string, { id: string; label: string }[]> = {
  ventas: [
    { id: "dia", label: "Por día" },
    { id: "producto", label: "Por producto" },
    { id: "marca", label: "Por marca" },
    { id: "pago", label: "Por medio de pago" },
    { id: "usuario", label: "Por usuario" },
  ],
  rentabilidad: [
    { id: "producto", label: "Por producto" },
    { id: "marca", label: "Por marca" },
    { id: "periodo", label: "Por día" },
  ],
  compras: [
    { id: "proveedor", label: "Por proveedor" },
    { id: "fecha", label: "Por fecha" },
    { id: "producto", label: "Por producto" },
    { id: "documentos", label: "Documentos" },
  ],
  inventario: [
    { id: "existencias", label: "Existencias" },
    { id: "entradas", label: "Entradas" },
    { id: "salidas", label: "Salidas" },
    { id: "transferencias", label: "Transferencias" },
    { id: "ajustes", label: "Ajustes" },
    { id: "mermas", label: "Mermas" },
    { id: "conteo_ciego", label: "Inventario ciego" },
    { id: "conteo_correccion", label: "Corrección de stock" },
    { id: "conteo_faltas", label: "Faltas y sobras" },
  ],
  caja: [
    { id: "medios", label: "Medios de pago" },
    { id: "movimientos", label: "Movimientos" },
    { id: "cierres", label: "Cierres" },
  ],
  clientes: [
    { id: "compras", label: "Mejores clientes" },
    { id: "creditos", label: "Créditos" },
  ],
}

const TONES: Record<ReportTone, string> = {
  teal: "#0d9488",
  indigo: "#6366f1",
  emerald: "#10b981",
  red: "#ef4444",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  sky: "#0ea5e9",
  rose: "#e11d48",
  slate: "#64748b",
}

function iso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function presets() {
  const now = new Date()
  const today = iso(now)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const week = new Date(now)
  week.setDate(now.getDate() - 6)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  return [
    { id: "hoy", label: "Hoy", desde: today, hasta: today },
    { id: "ayer", label: "Ayer", desde: iso(yesterday), hasta: iso(yesterday) },
    { id: "7d", label: "Últimos 7 días", desde: iso(week), hasta: today },
    { id: "mes", label: "Este mes", desde: iso(monthStart), hasta: today },
    { id: "mesant", label: "Mes anterior", desde: iso(prevStart), hasta: iso(prevEnd) },
  ]
}

function fmtDate(value: string) {
  const [y, m, d] = value.split("-")
  return `${d}/${m}/${y}`
}

function downloadCsv(filename: string, report: ReportData) {
  const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`
  const lines = [report.columns, ...report.rows, ...(report.footer ? [report.footer] : [])].map((row) => row.map(escape).join(";"))
  // BOM para que Excel abra bien las tildes; ";" es el separador de Excel en español.
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** fixedArea «inventario»: los informes de inventario en su propia área (Inventario → Informes de inventario). */
export function ReportsPage({ fixedArea }: { fixedArea?: string } = {}) {
  const [params, setParams] = useSearchParams()
  const visibleAreas = fixedArea ? AREAS.filter((item) => item.id === fixedArea) : AREAS.filter((item) => item.id !== "inventario")
  const requested = params.get("area") ?? ""
  const area = fixedArea ?? (visibleAreas.some((item) => item.id === requested) ? requested : visibleAreas[0].id)
  const areaInfo = AREAS.find((item) => item.id === area)
  const groups = GROUPS[area] ?? []
  const grupo = groups.some((item) => item.id === params.get("grupo")) ? params.get("grupo")! : groups[0]?.id ?? ""
  const ranges = useMemo(() => presets(), [])
  const desde = params.get("desde") || ranges[3].desde
  const hasta = params.get("hasta") || ranges[3].hasta
  const [report, setReport] = useState<ReportData | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  function update(patch: Record<string, string>) {
    // En el área fija (Inventario) no se guarda «area» en la dirección.
    const next = { area: fixedArea ? "" : area, grupo, desde, hasta, ...patch }
    setParams(Object.fromEntries(Object.entries(next).filter(([, value]) => value)) as Record<string, string>)
  }

  useEffect(() => {
    if (!areaInfo) {
      setReport(null)
      return
    }
    let cancelled = false
    setPending(true)
    setError("")
    getReport({ area, grupo, desde, hasta })
      .then((data) => {
        if (!cancelled) setReport(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error")
      })
      .finally(() => {
        if (!cancelled) setPending(false)
      })
    return () => {
      cancelled = true
    }
  }, [area, areaInfo, grupo, desde, hasta])

  if (!areaInfo) return null

  const color = areaInfo.color
  const activePreset = ranges.find((item) => item.desde === desde && item.hasta === hasta)?.id
  const Icon = areaInfo.icon

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      {/* Teléfono: selector del tipo de informe. */}
      {visibleAreas.length > 1 ? (
        <label className="block md:hidden">
          <span className="text-xs font-semibold text-slate-500">Tipo de informe</span>
          <select
            className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-sm font-semibold text-[var(--pf-navy)]"
            value={area}
            onChange={(event) => update({ area: event.target.value, grupo: "" })}
          >
            {visibleAreas.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className={`grid gap-4 ${visibleAreas.length > 1 ? "md:grid-cols-[210px_minmax(0,1fr)]" : ""}`}>
        {/* PC y tablet: panel lateral solo con el botón de cada tipo de informe. */}
        {visibleAreas.length > 1 ? (
          <aside className="hidden self-start rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:sticky md:top-4 md:block">
            {visibleAreas.map((item) => {
              const AreaIcon = item.icon
              const active = item.id === area
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => update({ area: item.id, grupo: "" })}
                  className="mb-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50"
                  style={active ? { background: tint(item.color, 0.15), color: item.color } : { color: "#475569" }}
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg"
                    style={active ? { background: item.color, color: "#fff" } : { background: tint(item.color, 0.12), color: item.color }}
                  >
                    <AreaIcon size={16} />
                  </span>
                  {item.title}
                </button>
              )
            })}
          </aside>
        ) : null}

        <div className="min-w-0 space-y-4">
          {/* Informe elegido con sus filtros a la derecha; la información va abajo. */}
          <section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border bg-white p-3 shadow-sm" style={{ borderColor: tint(color, 0.3) }}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ background: color }}>
                <Icon size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-[var(--pf-navy)]">
                  {areaInfo.title}
                </p>
                <p className="text-xs text-slate-500">
                  Del <b className="text-slate-700">{fmtDate(desde)}</b> al <b className="text-slate-700">{fmtDate(hasta)}</b>
                  {report ? ` · ${report.description}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {groups.length > 1 ? (
                <label className="text-xs font-medium text-slate-500">
                  Ver
                  <select
                    className="mt-1 block h-9 rounded-lg border px-2 text-sm font-semibold"
                    style={{ borderColor: tint(color, 0.5), color }}
                    value={grupo}
                    onChange={(event) => update({ grupo: event.target.value })}
                  >
                    {groups.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="flex flex-wrap gap-1">
                {ranges.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => update({ desde: item.desde, hasta: item.hasta })}
                    className="h-9 rounded-lg px-2.5 text-xs font-semibold ring-1 transition"
                    style={
                      activePreset === item.id
                        ? { background: color, color: "#fff", boxShadow: `0 0 0 1px ${color}` }
                        : { background: "#fff", color: "#475569", boxShadow: "0 0 0 1px #e2e8f0" }
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="text-xs font-medium text-slate-500">
                Desde
                <input
                  type="date"
                  className="mt-1 block h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800"
                  value={desde}
                  max={hasta}
                  onChange={(event) => event.target.value && update({ desde: event.target.value })}
                />
              </label>
              <label className="text-xs font-medium text-slate-500">
                Hasta
                <input
                  type="date"
                  className="mt-1 block h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-800"
                  value={hasta}
                  min={desde}
                  onChange={(event) => event.target.value && update({ hasta: event.target.value })}
                />
              </label>
              {report && report.rows.length > 0 ? (
                <button
                  type="button"
                  onClick={() => downloadCsv(`informe-${area}-${grupo}-${desde}_${hasta}.csv`, report)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white shadow-sm hover:brightness-110"
                  style={{ background: color }}
                >
                  <Download size={15} /> Excel
                </button>
              ) : null}
            </div>
          </section>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {pending && !report ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      ) : null}

      {report ? (
        <div className={`space-y-4 transition-opacity ${pending ? "opacity-60" : ""}`}>
          <div className={`grid grid-cols-2 gap-3 ${report.kpis.length >= 6 ? "md:grid-cols-3 xl:grid-cols-6" : report.kpis.length >= 5 ? "md:grid-cols-3 xl:grid-cols-5" : "md:grid-cols-4"}`}>
            {report.kpis.map((item) => {
              const tone = TONES[item.tone] ?? TONES.slate
              return (
                <div
                  key={item.label}
                  className="rounded-2xl border p-4 shadow-sm"
                  style={{ borderColor: tint(tone, 0.3), background: `linear-gradient(180deg, ${tint(tone, 0.08)}, #fff 75%)` }}
                >
                  <p className="flex items-center gap-1.5 text-sm text-slate-500">
                    <span className="size-2 rounded-full" style={{ background: tone }} />
                    {item.label}
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl" style={{ color: tone }}>
                    {item.value}
                  </p>
                </div>
              )
            })}
          </div>

          <ReportChart report={report} color={color} />

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-[var(--pf-navy)]">Detalle</h2>
              <span className="text-xs text-slate-500">
                {report.rows.length} fila{report.rows.length === 1 ? "" : "s"}
              </span>
            </div>
            {report.rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">{report.empty}</p>
            ) : (
              <div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="w-10 px-3 py-2 text-center">#</th>
                      {report.columns.map((column, index) => (
                        <th key={column} className={`px-3 py-2 ${report.numeric.includes(index) ? "text-right" : ""}`}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        <td className="px-3 py-2 text-center text-xs text-slate-400">{rowIndex + 1}</td>
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className={`px-3 py-2 ${report.numeric.includes(cellIndex) ? "whitespace-nowrap text-right" : ""} ${
                              cellIndex === 0 ? "font-medium text-[var(--pf-navy)]" : "text-slate-700"
                            } ${cell.startsWith("-S/") || cell.startsWith("S/ -") ? "text-red-700" : ""}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {report.footer ? (
                    <tfoot>
                      <tr style={{ background: tint(color, 0.08) }}>
                        <td />
                        {report.footer.map((cell, index) => (
                          <td
                            key={index}
                            className={`px-3 py-2.5 font-bold ${report.numeric.includes(index) ? "whitespace-nowrap text-right" : ""}`}
                            style={{ color: index === 0 ? "#0f172a" : color }}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
        </div>
      </div>
    </div>
  )
}

function ReportChart({ report, color }: { report: ReportData; color: string }) {
  const points = report.chart
  const total = points.reduce((sum, row) => sum + Math.max(0, row.value), 0)
  const max = Math.max(...points.map((row) => Math.abs(row.value)), 1)

  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-[var(--pf-navy)]">{report.chartTitle}</h2>
        <p className="mt-6 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{report.empty}</p>
      </div>
    )
  }

  if (report.chartKind === "time") {
    const best = points.reduce((a, b) => (b.value > a.value ? b : a), points[0])
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-[var(--pf-navy)]">{report.chartTitle}</h2>
          <p className="text-xs text-slate-500">
            Mejor día: <b style={{ color }}>{best.label}</b> · {best.text}
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <div className="flex h-56 items-end gap-1.5" style={{ minWidth: `${Math.max(points.length * 2.6, 16)}rem` }}>
            {points.map((row) => {
              const negative = row.value < 0
              const isBest = row === best
              const barColor = negative ? "#ef4444" : isBest ? "#f59e0b" : color
              return (
                <div key={row.label} className="group flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1" title={`${row.label}: ${row.text}`}>
                  <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums" style={{ color: barColor }}>
                    {row.text.replace("S/ ", "")}
                  </span>
                  <div
                    className="w-full rounded-t-lg transition group-hover:brightness-110"
                    style={{
                      height: `${Math.max(3, (Math.abs(row.value) / max) * 100)}%`,
                      background: `linear-gradient(180deg, ${barColor}, ${tint(barColor, 0.55)})`,
                    }}
                  />
                  <span className="whitespace-nowrap text-[10px] text-slate-500">{row.label.slice(0, 5)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const top = points.slice(0, 10)
  const rest = points.slice(10)
  const restValue = rest.reduce((sum, row) => sum + row.value, 0)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-[var(--pf-navy)]">{report.chartTitle}</h2>
        {points.length > 10 ? <p className="text-xs text-slate-500">Los 10 primeros de {points.length}</p> : null}
      </div>
      <div className="mt-4 space-y-2.5">
        {top.map((row, index) => {
          const barColor = row.value < 0 ? "#ef4444" : PALETTE[index % PALETTE.length]
          const share = report.chartMoney && total > 0 && row.value > 0 ? (row.value / total) * 100 : null
          return (
            <div key={`${row.label}-${index}`} className="grid grid-cols-[1.5rem_minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm sm:grid-cols-[1.5rem_minmax(0,14rem)_minmax(0,1fr)_auto]">
              <span className="grid size-6 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: barColor }}>
                {index + 1}
              </span>
              <span className="truncate font-medium text-slate-700" title={row.label}>
                {row.label}
              </span>
              <span className="h-3 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-3 rounded-full"
                  style={{ width: `${Math.max(3, (Math.abs(row.value) / max) * 100)}%`, background: `linear-gradient(90deg, ${tint(barColor, 0.6)}, ${barColor})` }}
                />
              </span>
              <span className="whitespace-nowrap text-right tabular-nums">
                <b style={{ color: barColor }}>{row.text}</b>
                {share !== null ? <span className="ml-1.5 text-xs text-slate-400">{share.toFixed(1)} %</span> : null}
              </span>
            </div>
          )
        })}
        {rest.length > 0 && report.chartMoney ? (
          <p className="pt-1 text-xs text-slate-500">
            Otros {rest.length}: {(restValue / 100).toFixed(2)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
