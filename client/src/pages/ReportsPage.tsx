import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { getReport } from "../api"

const AREAS = [
  { id: "ventas", title: "Ventas", text: "Ingresos, operaciones y medios de pago." },
  { id: "compras", title: "Compras", text: "Compras, proveedores y costos." },
  { id: "inventario", title: "Inventario", text: "Existencias y movimientos." },
  { id: "caja", title: "Caja", text: "Ingresos, egresos y cierres." },
  { id: "rentabilidad", title: "Rentabilidad", text: "Costos y utilidad bruta." },
  { id: "clientes", title: "Clientes", text: "Compras y créditos." },
] as const

const GROUPS: Record<string, { id: string; label: string }[]> = {
  ventas: [
    { id: "dia", label: "Por día" },
    { id: "usuario", label: "Por usuario" },
    { id: "producto", label: "Por producto" },
    { id: "categoria", label: "Por categoría" },
    { id: "pago", label: "Por medio de pago" },
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
    { id: "vencimientos", label: "Próximos a vencer" },
  ],
  caja: [
    { id: "medios", label: "Medios de pago" },
    { id: "cierres", label: "Cierres" },
    { id: "movimientos", label: "Movimientos" },
  ],
  rentabilidad: [
    { id: "producto", label: "Por producto" },
    { id: "categoria", label: "Por categoría" },
    { id: "periodo", label: "Por período" },
  ],
  clientes: [
    { id: "compras", label: "Compras" },
    { id: "creditos", label: "Créditos" },
  ],
}

function todayInput() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

function monthStartInput() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  return `${now.getFullYear()}-${month}-01`
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const area = params.get("area") ?? ""
  const grupo = params.get("grupo") ?? GROUPS[area]?.[0]?.id ?? "dia"
  const [desde, setDesde] = useState(params.get("desde") || monthStartInput())
  const [hasta, setHasta] = useState(params.get("hasta") || todayInput())
  const [report, setReport] = useState<Awaited<ReturnType<typeof getReport>> | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const groups = GROUPS[area] ?? []

  useEffect(() => {
    if (!area || !GROUPS[area]) {
      setReport(null)
      return
    }
    setPending(true)
    setError("")
    getReport({ area, grupo, desde, hasta })
      .then(setReport)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
      .finally(() => setPending(false))
  }, [area, grupo, desde, hasta])

  const maxChart = useMemo(
    () => Math.max(...(report?.chart.map((row) => Math.abs(row.value)) ?? [1]), 1),
    [report],
  )

  if (!area) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Informes</h1>
        <p className="text-sm text-slate-500">Selecciona el área que deseas analizar.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {AREAS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setParams({ area: item.id, grupo: GROUPS[item.id][0].id })}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[var(--pf-accent)]"
            >
              <p className="font-semibold text-[var(--pf-navy)]">{item.title}</p>
              <p className="mt-1 text-sm text-slate-500">{item.text}</p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/informes" className="text-sm text-[var(--pf-accent)] hover:underline">
            Todas las áreas
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--pf-navy)]">
            {AREAS.find((item) => item.id === area)?.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{report?.description}</p>
        </div>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-4">
        <label className="text-sm">
          Desde
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={desde}
            onChange={(event) => setDesde(event.target.value)}
          />
        </label>
        <label className="text-sm">
          Hasta
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={hasta}
            onChange={(event) => setHasta(event.target.value)}
          />
        </label>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {groups.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setParams({ area, grupo: item.id, desde, hasta })}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              item.id === grupo ? "bg-[var(--pf-navy)] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {pending ? <p className="text-sm text-slate-500">Generando…</p> : null}
      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {report.kpis.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className="mt-1 text-xl font-semibold text-[var(--pf-navy)]">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-[var(--pf-navy)]">{report.chartTitle}</h2>
            <div className="mt-4 space-y-2">
              {report.chart.slice(0, 8).map((row, index) => (
                <div key={`${row.label}-${index}`} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                  <span className="truncate text-slate-600">{row.label}</span>
                  <span className="h-2 rounded-full bg-slate-100">
                    <span
                      className="block h-2 rounded-full bg-[var(--pf-accent)]"
                      style={{ width: `${Math.max(4, (Math.abs(row.value) / maxChart) * 100)}%` }}
                    />
                  </span>
                  <span className="text-[var(--pf-navy)]">{row.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {report.columns.map((column) => (
                    <th key={column} className="px-3 py-2 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
