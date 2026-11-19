import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { getSalesHistory } from "../api"

export function SalesHistoryPage() {
  const [params] = useSearchParams()
  const onlyVoided = params.get("status") === "VOIDED"
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
          <p className="mt-1 text-sm text-slate-500">Últimas 150 operaciones.</p>
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
            <Link to="/ventas/historial?status=VOIDED" className="font-medium text-[var(--pf-navy)] hover:underline">
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
                <td className="px-3 py-2">{row.createdAtLabel}</td>
                <td className="px-3 py-2">
                  <span className={row.status === "VOIDED" ? "text-red-600" : "text-emerald-700"}>{row.statusLabel}</span>
                </td>
                <td className="px-3 py-2">{row.customerName}</td>
                <td className="px-3 py-2">{row.userName}</td>
                <td className="px-3 py-2">{row.payments || "—"}</td>
                <td className="px-3 py-2 text-right font-medium">{row.total}</td>
                <td className="px-3 py-2 text-right">
                  <Link to={`/ventas/${row.id}`} className="text-[var(--pf-accent)] hover:underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
