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
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Alertas de stock</h1>
        <p className="mt-1 text-sm text-slate-500">
          {data ? `Almacén ${data.warehouseName}. ` : ""}
          Stock bajo y lotes que vencen en 15 días.
        </p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--pf-navy)]">Por vencer</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {(data?.lots.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Ningún lote vence en los próximos 15 días.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Lote</th>
                  <th className="px-3 py-2 font-medium">Cantidad</th>
                  <th className="px-3 py-2 font-medium">Vencimiento</th>
                  <th className="px-3 py-2 font-medium">Aviso</th>
                </tr>
              </thead>
              <tbody>
                {data!.lots.map((lot) => (
                  <tr key={lot.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{lot.productName}</td>
                    <td className="px-3 py-2">{lot.code}</td>
                    <td className="px-3 py-2">{lot.quantity}</td>
                    <td className="px-3 py-2">{lot.expiresAtLabel}</td>
                    <td className="px-3 py-2">{lot.notice}</td>
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
