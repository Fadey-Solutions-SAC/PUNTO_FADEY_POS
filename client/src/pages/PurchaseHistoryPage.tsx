import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getPurchaseHistory } from "../api"

export function PurchaseHistoryPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPurchaseHistory>>["purchases"]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    getPurchaseHistory()
      .then((data) => setRows(data.purchases))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Historial de compras</h1>
        <p className="mt-1 text-sm text-slate-500">Una pendiente no mueve existencias hasta recibirla.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Proveedor</th>
              <th className="px-3 py-2 font-medium">Documento</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium text-right">Deuda</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.createdAtLabel}</td>
                <td className="px-3 py-2">
                  <Link to={`/pendiente/compras/${row.id}`} className="text-[var(--pf-accent)] hover:underline">
                    {row.supplierName}
                  </Link>
                </td>
                <td className="px-3 py-2">{row.documentNumber}</td>
                <td className="px-3 py-2">{row.statusLabel}</td>
                <td className="px-3 py-2 text-right">{row.total}</td>
                <td className="px-3 py-2 text-right">{row.debt}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error ? <p className="px-3 py-6 text-center text-sm text-slate-500">Sin compras.</p> : null}
      </div>
    </div>
  )
}
