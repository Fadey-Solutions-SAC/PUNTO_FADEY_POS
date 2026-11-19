import { useEffect, useState } from "react"
import { getInventoryKardex } from "../api"

export function KardexPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getInventoryKardex>>["movements"]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    getInventoryKardex()
      .then((data) => setRows(data.movements))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Kardex</h1>
        <p className="mt-1 text-sm text-slate-500">Entradas, salidas y saldo después de cada movimiento.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Almacén</th>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Cantidad</th>
              <th className="px-3 py-2 font-medium">Saldo</th>
              <th className="px-3 py-2 font-medium">Responsable</th>
              <th className="px-3 py-2 font-medium">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 whitespace-nowrap">{row.createdAtLabel}</td>
                <td className="px-3 py-2">{row.warehouseName}</td>
                <td className="px-3 py-2">{row.productName}</td>
                <td className="px-3 py-2">{row.typeLabel}</td>
                <td className="px-3 py-2">{row.quantityLabel}</td>
                <td className="px-3 py-2">{row.balanceLabel}</td>
                <td className="px-3 py-2">{row.userName}</td>
                <td className="px-3 py-2">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error ? <p className="px-3 py-6 text-center text-sm text-slate-500">Sin movimientos.</p> : null}
      </div>
    </div>
  )
}
