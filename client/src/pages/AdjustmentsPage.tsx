import { useEffect, useMemo, useState } from "react"
import { getInventoryAdjustments, postInventoryAdjustment } from "../api"

export function AdjustmentsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getInventoryAdjustments>> | null>(null)
  const [error, setError] = useState("")
  const [reason, setReason] = useState("Conteo físico")
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState("")
  const [message, setMessage] = useState("")
  /** Lote elegido por producto ("" = automático; "__new" = escribir uno nuevo). */
  const [lotChoice, setLotChoice] = useState<Record<string, string>>({})
  const [newLot, setNewLot] = useState<Record<string, string>>({})

  async function reload() {
    const payload = await getInventoryAdjustments()
    setData(payload)
    setQuantities(Object.fromEntries(payload.products.map((product) => [product.id, product.stock])))
    setLotChoice(Object.fromEntries(payload.products.map((product) => [product.id, product.lots.length === 1 ? product.lots[0].code : ""])))
    setNewLot({})
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["products"]>()
    for (const product of data?.products ?? []) {
      const rows = map.get(product.category) ?? []
      rows.push(product)
      map.set(product.category, rows)
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "Sin marca") return 1
      if (b === "Sin marca") return -1
      return a.localeCompare(b, "es")
    })
  }, [data])

  async function save(productId: string, presentationId: string, name: string) {
    setPendingId(productId)
    setError("")
    setMessage("")
    try {
      const choice = lotChoice[productId] ?? ""
      const lotCode = choice === "__new" ? (newLot[productId] ?? "").trim() : choice
      if (choice === "__new" && !lotCode) throw new Error("Escribe el código del lote nuevo")
      await postInventoryAdjustment({
        productId,
        presentationId,
        quantity: quantities[productId] ?? "0",
        reason,
        lotCode: lotCode || undefined,
      })
      await reload()
      setMessage(`${name}: stock ajustado`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ajustar")
    } finally {
      setPendingId("")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Ajustes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Escribe el stock real en {data?.warehouseName ?? "el almacén"}. La diferencia queda en el kardex.
        </p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}
      <input
        className="max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Motivo"
      />
      {groups.map(([category, products]) => (
        <div key={category} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {category}
          </h2>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-left text-sm">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-64" />
              <col className="w-28" />
            </colgroup>
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Contado</th>
                <th className="px-3 py-2 font-medium">Lote</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="font-medium text-[var(--pf-navy)]">{product.name}</span>
                    <span className="block text-xs text-slate-500">
                      {product.code || "—"} · {product.brand}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {product.stock} {product.unit}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-24 rounded-xl border border-slate-200 px-3 py-2"
                      value={quantities[product.id] ?? product.stock}
                      onChange={(event) =>
                        setQuantities((current) => ({ ...current, [product.id]: event.target.value }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    {product.trackLots ? (
                      <div className="space-y-1">
                        <select
                          aria-label={`Lote de ${product.name}`}
                          className="h-10 w-full rounded-xl border border-slate-200 px-2 text-xs"
                          value={lotChoice[product.id] ?? ""}
                          onChange={(event) => setLotChoice((current) => ({ ...current, [product.id]: event.target.value }))}
                        >
                          {product.lots.length !== 1 ? (
                            <option value="">{product.lots.length === 0 ? "Automático (lote nuevo AJ)" : "Automático (sale por vencimiento)"}</option>
                          ) : null}
                          {product.lots.map((lot) => (
                            <option key={lot.code} value={lot.code}>
                              {lot.code} · {lot.quantity} {product.unit}
                              {lot.expiresAt ? ` · vence ${lot.expiresAt}` : ""}
                            </option>
                          ))}
                          <option value="__new">+ Lote nuevo…</option>
                        </select>
                        {lotChoice[product.id] === "__new" ? (
                          <input
                            className="h-9 w-full rounded-xl border border-slate-200 px-2 text-xs"
                            placeholder="Código del lote"
                            value={newLot[product.id] ?? ""}
                            onChange={(event) => setNewLot((current) => ({ ...current, [product.id]: event.target.value }))}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={pendingId === product.id}
                      onClick={() => save(product.id, product.presentationId, product.name)}
                      className="rounded-xl bg-[var(--pf-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {pendingId === product.id ? "…" : "Guardar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ))}
    </div>
  )
}
