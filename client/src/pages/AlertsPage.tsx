import { useEffect, useState } from "react"
import { getInventoryAlerts } from "../api"

export function AlertsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getInventoryAlerts>> | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    getInventoryAlerts()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <p className="mt-1 text-sm text-slate-500">
          {data ? `Almacén ${data.warehouseName}. ` : ""}
          Productos agotados, con stock bajo y por vencer en los próximos 30 días.
        </p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--pf-navy)]">Por vencer (30 días)</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {(data?.lots.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Nada vence en los próximos 30 días.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Grupo (compra)</th>
                  <th className="px-3 py-2 font-medium">Cantidad</th>
                  <th className="px-3 py-2 font-medium">Vence</th>
                  <th className="px-3 py-2 font-medium">Aviso</th>
                </tr>
              </thead>
              <tbody>
                {data!.lots.map((lot) => (
                  <tr key={lot.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{lot.productName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{lot.code}</td>
                    <td className="px-3 py-2">{lot.quantity}</td>
                    <td className="px-3 py-2">{lot.expiresAtLabel}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${/venci|hoy|mañana/i.test(lot.notice) ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                        {lot.notice}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--pf-navy)]">Stock bajo</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {(data?.stockAlerts.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Sin alertas de stock.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Mínimo</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data!.stockAlerts.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.stock}</td>
                    <td className="px-3 py-2">{row.minStock}</td>
                    <td className={`px-3 py-2 ${row.state === "Agotado" ? "text-red-600" : "text-amber-700"}`}>
                      {row.state}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
