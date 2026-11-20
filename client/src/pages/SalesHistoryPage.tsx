import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { getSalesHistory } from "../api"

export function SalesHistoryPage({ voidedOnly = false }: { voidedOnly?: boolean }) {
  const [params] = useSearchParams()
  const onlyVoided = voidedOnly || params.get("status") === "VOIDED"
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getSalesHistory>>["sales"]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    getSalesHistory(onlyVoided ? "VOIDED" : undefined)
      .then((data) => {
        if (!cancelled) setRows(data.sales)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error")
      })
    return () => {
      cancelled = true
    }
  }, [onlyVoided])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">
            {onlyVoided ? "Anulaciones" : "Historial de ventas"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {rows.length} {rows.length === 1 ? "operación" : "operaciones"} · últimas 150.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link to="/ventas" className="font-medium text-[var(--pf-accent)] hover:underline">
            Nueva venta
          </Link>
          {onlyVoided ? (
            <Link to="/ventas/historial" className="font-medium text-[var(--pf-navy)] hover:underline">
              Todas
            </Link>
          ) : (
            <Link to="/ventas/anulaciones" className="font-medium text-[var(--pf-navy)] hover:underline">
              Solo anuladas
            </Link>
          )}
        </div>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Venta</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Usuario</th>
              <th className="px-3 py-2 font-medium">Pago</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs font-semibold text-[var(--pf-navy)]">{row.code}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{row.createdAtLabel}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.status === "VOIDED" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {row.statusLabel}
                  </span>
                </td>
                <td className="px-3 py-2">{row.customerName}</td>
                <td className="px-3 py-2">{row.userName}</td>
                <td className="px-3 py-2">{row.payments || "—"}</td>
                <td
                  className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${
                    row.status === "VOIDED" ? "text-slate-400 line-through" : "text-[var(--pf-navy)]"
                  }`}
                >
                  {row.total}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    to={`/ventas/${row.id}`}
                    className="rounded-lg px-2 py-1 font-medium text-[var(--pf-accent)] hover:bg-[var(--pf-accent)]/10"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error ? (
          <p className="px-3 py-10 text-center text-sm text-slate-500">
            {onlyVoided ? "No hay ventas anuladas." : "Todavía no hay ventas registradas."}
          </p>
        ) : null}
      </div>
    </div>
  )
}
