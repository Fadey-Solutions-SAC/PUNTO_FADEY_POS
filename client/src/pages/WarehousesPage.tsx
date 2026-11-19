import { useEffect, useMemo, useState } from "react"
import { getInventoryWarehouses } from "../api"

export function WarehousesPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getInventoryWarehouses>> | null>(null)
  const [error, setError] = useState("")
  const [selectedId, setSelectedId] = useState("")

  useEffect(() => {
    getInventoryWarehouses()
      .then((payload) => {
        setData(payload)
        setSelectedId(payload.warehouses.find((w) => w.inUse)?.id ?? payload.warehouses[0]?.id ?? "")
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  const selected = useMemo(
    () => data?.warehouses.find((warehouse) => warehouse.id === selectedId) ?? null,
    [data, selectedId],
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Almacenes</h1>
        <p className="mt-1 text-sm text-slate-500">Elige un almacén para ver sus productos. Alta/baja siguen en Next.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {(data?.warehouses ?? []).map((warehouse) => (
          <button
            key={warehouse.id}
            type="button"
            onClick={() => setSelectedId(warehouse.id)}
            className={`rounded-xl border px-3 py-2 text-sm ${
              warehouse.id === selectedId
                ? "border-[var(--pf-accent)] bg-[var(--pf-accent)]/10 font-medium text-[var(--pf-navy)]"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {warehouse.name}
            {warehouse.inUse ? " · actual" : ""}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-3 py-2 text-sm text-slate-500">
            {selected.name} · {selected.branch}
            {selected.isDefault ? " · predeterminado" : ""}
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Categoría</th>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {selected.rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-500">{row.code || "—"}</td>
                  <td className="px-3 py-2">
                    {row.name}
                    <span className="block text-xs text-slate-500">{row.brand}</span>
                  </td>
                  <td className="px-3 py-2">{row.category}</td>
                  <td className="px-3 py-2">{row.stock}</td>
                  <td
                    className={`px-3 py-2 ${
                      row.state === "Agotado" ? "text-red-600" : row.state === "Bajo" ? "text-amber-700" : "text-emerald-700"
                    }`}
                  >
                    {row.state}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected.rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">Sin saldos en este almacén.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
