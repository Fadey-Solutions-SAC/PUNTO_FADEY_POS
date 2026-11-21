import { useEffect, useMemo, useState } from "react"
import {
  cancelInventoryTransfer,
  getInventoryTransfers,
  receiveInventoryTransfer,
  sendInventoryTransfer,
} from "../api"

export function TransfersPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getInventoryTransfers>> | null>(null)
  const [error, setError] = useState("")
  const [fromWarehouseId, setFromWarehouseId] = useState("")
  const [toWarehouseId, setToWarehouseId] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<{ productId: string; quantity: string }[]>([])
  const [pending, setPending] = useState(false)

  async function reload() {
    const payload = await getInventoryTransfers()
    setData(payload)
    setFromWarehouseId((current) => current || payload.currentWarehouseId)
    const dest =
      payload.warehouses.find((w) => w.id !== (fromWarehouseId || payload.currentWarehouseId))?.id ?? ""
    setToWarehouseId((current) => (current && current !== fromWarehouseId ? current : dest))
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  const destinations = useMemo(
    () => (data?.warehouses ?? []).filter((warehouse) => warehouse.id !== fromWarehouseId),
    [data, fromWarehouseId],
  )

  function addProduct(productId: string) {
    if (!productId) return
    setLines((current) =>
      current.some((line) => line.productId === productId)
        ? current
        : [...current, { productId, quantity: "1" }],
    )
  }

  async function onSend() {
    setPending(true)
    setError("")
    try {
      await sendInventoryTransfer({ fromWarehouseId, toWarehouseId, notes, lines })
      setLines([])
      setNotes("")
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mt-1 text-sm text-slate-500">Al enviar sale del origen; al recibir entra al destino.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="max-w-xl space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm">
          Origen
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={fromWarehouseId}
            onChange={(event) => {
              const next = event.target.value
              setFromWarehouseId(next)
              setToWarehouseId((current) =>
                current === next ? (data?.warehouses.find((w) => w.id !== next)?.id ?? "") : current,
              )
            }}
          >
            {(data?.warehouses ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Destino
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={toWarehouseId}
            onChange={(event) => setToWarehouseId(event.target.value)}
          >
            {destinations.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Producto
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            defaultValue=""
            onChange={(event) => {
              addProduct(event.target.value)
              event.target.value = ""
            }}
          >
            <option value="">Agregar…</option>
            {(data?.products ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        {lines.map((line) => (
          <div key={line.productId} className="flex items-center gap-2">
            <span className="flex-1 text-sm">
              {data?.products.find((product) => product.id === line.productId)?.name}
            </span>
            <input
              className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={line.quantity}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item) =>
                    item.productId === line.productId ? { ...item, quantity: event.target.value } : item,
                  ),
                )
              }
            />
          </div>
        ))}
        <input
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Nota"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <button
          type="button"
          disabled={pending || lines.length === 0 || !toWarehouseId}
          onClick={onSend}
          className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Enviando…" : "Enviar transferencia"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Ruta</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(data?.transfers ?? []).map((transfer) => (
              <tr key={transfer.id} className="border-t border-slate-100">
                <td className="px-3 py-2 whitespace-nowrap">{transfer.createdAtLabel}</td>
                <td className="px-3 py-2">{transfer.route}</td>
                <td className="px-3 py-2">{transfer.statusLabel}</td>
                <td className="px-3 py-2">{transfer.detail || "—"}</td>
                <td className="px-3 py-2 text-right">
                  {transfer.canReceive ? (
                    <span className="inline-flex gap-2">
                      <button
                        type="button"
                        className="text-[var(--pf-accent)] hover:underline"
                        onClick={() =>
                          receiveInventoryTransfer(transfer.id)
                            .then(reload)
                            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
                        }
                      >
                        Recibir
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() =>
                          cancelInventoryTransfer(transfer.id)
                            .then(reload)
                            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
                        }
                      >
                        Anular
                      </button>
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
