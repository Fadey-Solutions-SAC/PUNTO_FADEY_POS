import { useEffect, useMemo, useState } from "react"
import { getExpiryGroups, saveExpiryGroups, type ExpiryProduct } from "../api"

type EditLot = { id?: string; code?: string; expiresAt: string; quantity: string }

const num = (value: string) => Number(String(value).replace(",", ".")) || 0

/**
 * Corrección de informe (Productos a vencer): por producto se ven sus lotes con fecha y lo que queda sin fecha.
 * Se puede cambiar la fecha o la cantidad de un lote, quitarlo, o agregar uno nuevo tomando parte de lo «sin fecha».
 * No cambia el stock: solo cómo se reparte entre fechas.
 */
export function ExpiryCorrection({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<{ warehouseName: string; canEdit: boolean; products: ExpiryProduct[] } | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState("")
  const [lots, setLots] = useState<EditLot[]>([])
  const [busy, setBusy] = useState(false)

  async function load() {
    setData(await getExpiryGroups())
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  const products = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (data?.products ?? []).filter((item) => !term || item.name.toLowerCase().includes(term))
  }, [data, query])
  const selected = data?.products.find((item) => item.productId === selectedId) ?? null
  const stock = selected ? num(selected.stock) : 0
  const dated = lots.reduce((sum, lot) => sum + num(lot.quantity), 0)
  const undated = Math.round((stock - dated) * 10000) / 10000
  const over = undated < 0

  function pick(product: ExpiryProduct) {
    setSelectedId(product.productId)
    setLots(product.lots.map((lot) => ({ id: lot.id, code: lot.code, expiresAt: lot.expiresAt, quantity: lot.quantity })))
    setMessage("")
    setError("")
  }

  function change(index: number, patch: Partial<EditLot>) {
    setLots((current) => current.map((lot, i) => (i === index ? { ...lot, ...patch } : lot)))
  }

  async function onSave() {
    if (!selected) return
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await saveExpiryGroups(
        selected.productId,
        lots.filter((lot) => lot.expiresAt || lot.quantity).map((lot) => ({ id: lot.id, expiresAt: lot.expiresAt, quantity: lot.quantity || "0" })),
      )
      await load()
      setMessage(`${selected.name}: lotes corregidos`)
      setSelectedId("")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[var(--pf-navy)]/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Corrección de informe"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Corrección de informe</h2>
            <p className="text-xs text-slate-500">
              Productos a vencer · almacén {data?.warehouseName ?? "…"}. Corrige fechas y cantidades de cada lote o agrega uno nuevo. El stock no cambia.
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}
          {data && !data.canEdit ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Tu usuario no tiene permiso de ajustes para corregir.</p> : null}

          {selected ? (
            <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-[var(--pf-navy)]">{selected.name}</p>
                <p className="text-sm text-slate-600">
                  Stock: <b>{selected.stock} {selected.unit}</b> · Sin fecha:{" "}
                  <b className={over ? "text-red-600" : "text-slate-800"}>
                    {undated} {selected.unit}
                  </b>
                </p>
              </div>
              <div className="space-y-2">
                {lots.length === 0 ? <p className="text-sm text-slate-500">Este producto no tiene lotes con fecha. Agrega uno abajo.</p> : null}
                {lots.map((lot, index) => (
                  <div key={lot.id ?? `nuevo-${index}`} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_8rem_auto]">
                    <span className="truncate text-xs font-mono text-slate-500">{lot.code ?? "Lote nuevo"}</span>
                    <label className="text-xs font-medium text-slate-600">
                      Vence
                      <input
                        type="date"
                        className="mt-0.5 block h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm"
                        value={lot.expiresAt}
                        onChange={(event) => change(index, { expiresAt: event.target.value })}
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      Cantidad ({selected.unit})
                      <input
                        inputMode="decimal"
                        placeholder="Ej. 6"
                        className="mt-0.5 block h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-right text-sm"
                        value={lot.quantity}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => change(index, { quantity: event.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setLots((current) => current.filter((_, i) => i !== index))}
                      className="h-10 rounded-lg px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
              {over ? <p className="text-xs font-semibold text-red-600">Los lotes con fecha no pueden sumar más que el stock.</p> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setLots((current) => [...current, { expiresAt: "", quantity: undated > 0 ? String(undated) : "" }])}
                  className="h-10 rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800 hover:bg-amber-50"
                >
                  + Agregar lote con fecha
                </button>
                <span className="flex-1" />
                <button type="button" disabled={busy} onClick={() => setSelectedId("")} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">
                  Volver
                </button>
                <button
                  type="button"
                  disabled={busy || over || !data?.canEdit}
                  onClick={() => void onSave()}
                  className="h-10 rounded-xl bg-[var(--pf-accent)] px-5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Guardando…" : "Guardar corrección"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <input
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                placeholder="Buscar producto… Ej. ARROZ"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {!data ? <p className="text-sm text-slate-500">Cargando…</p> : null}
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {products.map((product) => (
                  <li key={product.productId} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--pf-navy)]">{product.name}</span>
                      <span className="block text-xs text-slate-500">
                        Stock {product.stock} {product.unit} · {product.lots.length} lote(s) con fecha · sin fecha {product.undated} {product.unit}
                        {product.lots[0] ? ` · próximo vence ${product.lots[0].expiresAt.split("-").reverse().join("/")}` : ""}
                      </span>
                    </span>
                    <button type="button" onClick={() => pick(product)} className="h-9 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-white hover:bg-amber-600">
                      Corregir
                    </button>
                  </li>
                ))}
                {data && products.length === 0 ? <li className="px-3 py-6 text-center text-sm text-slate-500">Sin productos con stock.</li> : null}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
