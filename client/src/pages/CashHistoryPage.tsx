import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getCashHistory } from "../api"

export function CashHistoryPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getCashHistory>>["sessions"]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    getCashHistory()
      .then((data) => {
        if (!cancelled) setRows(data.sessions)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Historial de caja</h1>
          <p className="mt-1 text-sm text-slate-500">Últimas sesiones abiertas y cerradas.</p>
        </div>
        <Link to="/caja" className="text-sm font-medium text-[var(--pf-accent)] hover:underline">
          Volver a caja
        </Link>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Apertura</th>
              <th className="px-3 py-2 font-medium">Caja</th>
              <th className="px-3 py-2 font-medium">Usuario</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium text-right">Apertura</th>
              <th className="px-3 py-2 font-medium text-right">Esperado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.openedAtLabel}</td>
                <td className="px-3 py-2">{row.registerName}</td>
                <td className="px-3 py-2">{row.userName}</td>
                <td className="px-3 py-2">{row.status === "OPEN" ? "Abierta" : "Cerrada"}</td>
                <td className="px-3 py-2 text-right">{row.opening.label}</td>
                <td className="px-3 py-2 text-right">{row.expected?.label ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
