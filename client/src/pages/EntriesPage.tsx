import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { PackagePlus, Plus } from "lucide-react"
import { getEntries, getLossForm, registerEntry, type EntryRow, type LossProduct } from "../api"
import { ProductPhoto } from "../components/ProductPhoto"
import { CodeField, playScanPit, ScannerButton } from "../components/Scanner"

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/** Entradas de stock sin compra: saldo inicial, producción, donación, devolución, sobrante. */
export function EntriesPage() {
  const now = new Date()
  const [desde, setDesde] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [hasta, setHasta] = useState(iso(now))
  const [data, setData] = useState<Awaited<ReturnType<typeof getEntries>> | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [open, setOpen] = useState(false)

  const load = useCallback(
    () =>
      getEntries({ desde, hasta })
        .then(setData)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error")),
    [desde, hasta],
  )

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white shadow-sm">
            <PackagePlus size={22} />
          </span>
          <div>
            <p className="text-sm text-slate-500">
              Stock que entra sin compra: saldo inicial, producción, donaciones, devoluciones o sobrantes. Almacén {data?.warehouseName ?? "actual"}.
              Las compras se registran en Compras → Recepción.
            </p>
          </div>
        </div>
        {data?.canRegister ? (
          <button
            type="button"
            onClick={() => {
              setMessage("")
              setOpen(true)
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus size={18} /> Registrar entrada
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="text-xs font-medium text-slate-500">
          Desde
          <input type="date" className="mt-1 block h-9 rounded-lg border border-slate-200 px-2 text-sm" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Hasta
          <input type="date" className="mt-1 block h-9 rounded-lg border border-slate-200 px-2 text-sm" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} />
        </label>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(data?.byCause ?? []).map((item) => (
            <span key={item.label} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              {item.label} · {item.count}
            </span>
          ))}
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-[var(--pf-navy)]">Entradas registradas</h2>
          <span className="text-xs text-slate-500">{data?.count ?? 0}</span>
        </div>
        {!data ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Cargando…</p>
        ) : data.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No hay entradas en este período.</p>
        ) : (
          <div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Motivo</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                  <th className="px-3 py-2">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row: EntryRow) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{row.createdAtLabel}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-[var(--pf-navy)]">{row.productName}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.reason}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-emerald-700">+{row.quantityLabel}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">{row.balanceLabel}</td>
                    <td className="px-3 py-2 text-slate-600">{row.userName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && data ? (
        <EntryForm
          causes={data.causes}
          onClose={() => setOpen(false)}
          onSaved={async (text) => {
            setOpen(false)
            setMessage(text)
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

function EntryForm({ causes, onClose, onSaved }: { causes: string[]; onClose: () => void; onSaved: (text: string) => void | Promise<void> }) {
  const [products, setProducts] = useState<LossProduct[]>([])
  const [query, setQuery] = useState("")
  const [product, setProduct] = useState<LossProduct | null>(null)
  const [cause, setCause] = useState("")
  const [presentationId, setPresentationId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [lotCode, setLotCode] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getLossForm()
      .then((data) => setProducts(data.products))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudo cargar el catálogo"))
  }, [])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    const list = text
      ? products.filter((item) => item.name.toLowerCase().includes(text) || item.code.toLowerCase().includes(text) || item.barcodes.some((code) => code.toLowerCase().includes(text)))
      : products
    return list.slice(0, 30)
  }, [products, query])

  function pick(item: LossProduct) {
    setProduct(item)
    setPresentationId(item.presentations[0]?.id ?? "")
    setQuantity("1")
    setError("")
  }

  function onCode(code: string) {
    const text = code.trim().toLowerCase()
    const found = products.find((item) => item.code.toLowerCase() === text || item.barcodes.some((b) => b.toLowerCase() === text))
    if (!found) return setError(`Código ${code} no registrado`)
    playScanPit()
    pick(found)
  }

  const presentation = product?.presentations.find((item) => item.id === presentationId) ?? product?.presentations[0]
  const qty = Number(quantity.replace(",", ".") || 0)
  const baseQty = presentation ? qty * presentation.factor : qty
  const needsNote = cause === "Otro" && !note.trim()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!product) return setError("Elige el producto")
    if (!cause) return setError("Elige el motivo")
    setSaving(true)
    setError("")
    try {
      const result = await registerEntry({
        productId: product.id,
        presentationId: presentation?.id,
        quantity,
        cause,
        note: note.trim() || undefined,
        lotCode: product.trackLots ? lotCode.trim() || undefined : undefined,
        expiresAt: product.trackLots ? expiresAt || undefined : undefined,
      })
      await onSaved(`${product.name}: +${quantity} ${presentation?.name ?? product.unit}. Stock ahora ${result.balanceLabel} ${product.unit}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[var(--pf-navy)]/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Registrar entrada"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <form onSubmit={onSubmit} className="max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-xl space-y-4 overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 shadow-xl sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Registrar entrada</h2>
          <button type="button" className="text-sm text-slate-500" onClick={onClose} disabled={saving}>
            Cerrar
          </button>
        </div>

        {product ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <ProductPhoto name={product.name} imagePath={product.imagePath} categoryId={product.brandId} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-[var(--pf-navy)]">{product.name}</p>
              <p className="text-xs text-slate-500">
                Stock actual: <b>{product.stockLabel} {product.unit}</b>
              </p>
            </div>
            <button type="button" className="text-xs font-semibold text-[var(--pf-accent)]" onClick={() => setProduct(null)}>
              Cambiar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto por nombre o código…" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm" />
              <ScannerButton onCode={onCode} />
            </div>
            <CodeField onCode={onCode} placeholder="O pasa el lector de código y Enter" />
            <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => pick(item)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
                    <ProductPhoto name={item.name} imagePath={item.imagePath} categoryId={item.brandId} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--pf-navy)]">{item.name}</span>
                    <span className="text-xs tabular-nums text-slate-500">
                      {item.stockLabel} {item.unit}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Motivo</p>
          <div className="flex flex-wrap gap-1.5">
            {causes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCause(item)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${cause === item ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {product ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Cantidad
              <input inputMode="decimal" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-right tabular-nums" value={quantity} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Presentación
              <select className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 text-sm" value={presentation?.id ?? ""} onChange={(e) => setPresentationId(e.target.value)}>
                {product.presentations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.factor !== 1 ? ` (${item.factor} ${product.unit})` : ""}
                  </option>
                ))}
              </select>
            </label>
            {product.trackLots ? (
              <>
                <label className="block text-sm font-medium text-slate-700">
                  Lote <span className="font-normal text-slate-400">(obligatorio)</span>
                  <input className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" value={lotCode} onChange={(e) => setLotCode(e.target.value)} list="entry-lots" />
                  <datalist id="entry-lots">
                    {product.lots.map((lot) => (
                      <option key={lot.code} value={lot.code} />
                    ))}
                  </datalist>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Vence
                  <input type="date" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </label>
              </>
            ) : null}
          </div>
        ) : null}

        <label className="block text-sm font-medium text-slate-700">
          Nota {cause === "Otro" ? <span className="text-red-600">(obligatoria)</span> : <span className="font-normal text-slate-400">(opcional)</span>}
          <textarea className="mt-1 min-h-14 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. conteo inicial del 20/11, producción del día…" />
        </label>

        {product ? (
          <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-3 text-sm">
            <span className="text-emerald-800">Entra al stock</span>
            <span className="text-lg font-bold tabular-nums text-emerald-700">
              +{Number.isFinite(baseQty) ? baseQty.toLocaleString("es-PE", { maximumFractionDigits: 4 }) : "—"} {product.unit}
            </span>
          </div>
        ) : null}

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={saving || !product || !cause || needsNote || !(qty > 0) || (product?.trackLots && !lotCode.trim())}
          className="h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {saving ? "Registrando…" : "Registrar y sumar al stock"}
        </button>
      </form>
    </div>
  )
}
