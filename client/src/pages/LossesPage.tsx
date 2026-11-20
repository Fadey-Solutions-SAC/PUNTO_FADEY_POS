import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Download, PackageMinus, Plus } from "lucide-react"
import {
  getLossForm,
  getLosses,
  registerLoss,
  voidLoss,
  type LossProduct,
  type LossRow,
  type LossTypeInfo,
} from "../api"
import { tint } from "../colors"
import { ProductPhoto } from "../components/ProductPhoto"
import { CodeField, playScanPit, ScannerButton } from "../components/Scanner"

type Data = Awaited<ReturnType<typeof getLosses>>

const TYPE_COLOR: Record<string, string> = {
  SHRINKAGE: "#f59e0b",
  LOSS: "#ef4444",
  INTERNAL: "#0ea5e9",
}

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function ranges() {
  const now = new Date()
  const week = new Date(now)
  week.setDate(now.getDate() - 6)
  return [
    { id: "hoy", label: "Hoy", desde: iso(now), hasta: iso(now) },
    { id: "7d", label: "Últimos 7 días", desde: iso(week), hasta: iso(now) },
    { id: "mes", label: "Este mes", desde: iso(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: iso(now) },
    {
      id: "mesant",
      label: "Mes anterior",
      desde: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      hasta: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
    },
  ]
}

function downloadCsv(rows: LossRow[], desde: string, hasta: string) {
  const header = ["Fecha", "Producto", "Código", "Tipo", "Causa", "Cantidad", "Costo unitario", "Costo total", "Lote", "Nota", "Usuario", "Estado"]
  const lines = [header, ...rows.map((row) => [
    row.createdAtLabel,
    row.productName,
    row.productCode,
    row.typeLabel,
    row.cause,
    row.quantityLabel,
    row.unitCost,
    row.totalCost,
    row.lotCode,
    row.note,
    row.userName,
    row.status === "VOIDED" ? `Revertida: ${row.voidReason}` : "Activa",
  ])].map((cells) => cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `mermas-${desde}_${hasta}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function LossesPage() {
  const presets = useMemo(() => ranges(), [])
  const [desde, setDesde] = useState(presets[2].desde)
  const [hasta, setHasta] = useState(presets[2].hasta)
  const [tipo, setTipo] = useState("")
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setError("")
    return getLosses({ desde, hasta, tipo: tipo || undefined })
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [desde, hasta, tipo])

  useEffect(() => {
    void load()
  }, [load])

  async function onVoid(row: LossRow) {
    const reason = window.prompt(`Revertir ${row.typeLabel.toLowerCase()} de ${row.productName} (${row.quantityLabel}).\nEl stock regresa al almacén. ¿Motivo?`)
    if (reason === null) return
    if (!reason.trim()) {
      setError("Indica el motivo para revertir")
      return
    }
    setBusy(true)
    setError("")
    try {
      await voidLoss(row.id, reason)
      setMessage("Registro revertido: el stock regresó al almacén.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revertir")
    } finally {
      setBusy(false)
    }
  }

  const activePreset = presets.find((item) => item.desde === desde && item.hasta === hasta)?.id
  const typeTotals = new Map((data?.summary.byType ?? []).map((item) => [item.code, item]))
  const maxCause = Math.max(...(data?.summary.byCause.map((item) => item.costCents) ?? [1]), 1)
  const maxProduct = Math.max(...(data?.summary.byProduct.map((item) => item.costCents) ?? [1]), 1)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-red-500 text-white shadow-sm">
            <PackageMinus size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Mermas y pérdidas</h1>
            <p className="text-sm text-slate-500">
              Productos vencidos, dañados, robados o de consumo interno. Descuentan stock del almacén {data?.warehouseName ?? "actual"}, quedan
              en el kardex y se valorizan al costo.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {data && data.rows.length > 0 ? (
            <button
              type="button"
              onClick={() => downloadCsv(data.rows, desde, hasta)}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[var(--pf-navy)] shadow-sm"
            >
              <Download size={16} /> CSV
            </button>
          ) : null}
          {data?.canRegister ? (
            <button
              type="button"
              onClick={() => {
                setMessage("")
                setFormOpen(true)
              }}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-red-600"
            >
              <Plus size={18} /> Registrar merma
            </button>
          ) : null}
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          {presets.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setDesde(item.desde)
                setHasta(item.hasta)
              }}
              className={`h-9 rounded-lg px-3 text-xs font-semibold ring-1 ${
                activePreset === item.id ? "bg-red-500 text-white ring-red-500" : "bg-white text-slate-600 ring-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
          <label className="ml-auto text-xs font-medium text-slate-500">
            Desde
            <input type="date" className="mt-1 block h-9 rounded-lg border border-slate-200 px-2 text-sm" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Hasta
            <input type="date" className="mt-1 block h-9 rounded-lg border border-slate-200 px-2 text-sm" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} />
          </label>
        </div>
        <div className="-mx-3 flex gap-2 overflow-x-auto border-t border-slate-100 px-3 pt-3">
          {[{ code: "", label: "Todos" }, ...(data?.types ?? [])].map((item) => {
            const color = TYPE_COLOR[item.code] ?? "#334155"
            const active = tipo === item.code
            return (
              <button
                key={item.code || "all"}
                type="button"
                onClick={() => setTipo(item.code)}
                className="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold"
                style={active ? { background: color, color: "#fff" } : { background: tint(color, 0.1), color }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </section>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 p-4 text-white shadow-sm">
              <p className="text-sm text-white/80">Total valorizado</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{data.summary.total}</p>
              <p className="text-xs text-white/80">
                {data.summary.count} registro{data.summary.count === 1 ? "" : "s"}
                {data.summary.voided ? ` · ${data.summary.voided} revertido${data.summary.voided === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            {data.types.map((type) => {
              const color = TYPE_COLOR[type.code]
              const total = typeTotals.get(type.code)
              return (
                <div
                  key={type.code}
                  className="rounded-2xl border p-4 shadow-sm"
                  style={{ borderColor: tint(color, 0.35), background: `linear-gradient(180deg, ${tint(color, 0.08)}, #fff 75%)` }}
                >
                  <p className="flex items-center gap-1.5 text-sm text-slate-500">
                    <span className="size-2 rounded-full" style={{ background: color }} />
                    {type.label}
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums" style={{ color }}>
                    {total?.cost ?? "S/ 0.00"}
                  </p>
                  <p className="text-xs text-slate-500">{total?.count ?? 0} registros</p>
                </div>
              )
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <RankCard title="Por causa" empty="Sin mermas en el período." items={data.summary.byCause} max={maxCause} color="#f59e0b" />
            <RankCard title="Productos más afectados" empty="Sin mermas en el período." items={data.summary.byProduct} max={maxProduct} color="#ef4444" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-[var(--pf-navy)]">Registros</h2>
              <span className="text-xs text-slate-500">{data.rows.length}</span>
            </div>
            {data.rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                No hay mermas en este período. Cuando algo se vence, se rompe o se pierde, regístralo con “Registrar merma”.
              </p>
            ) : (
              <div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2">Tipo · causa</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">Costo</th>
                      <th className="px-3 py-2">Usuario</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => {
                      const color = TYPE_COLOR[row.type] ?? "#64748b"
                      const voided = row.status === "VOIDED"
                      return (
                        <tr key={row.id} className={voided ? "opacity-60" : ""}>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">{row.createdAtLabel}</td>
                          <td className="px-3 py-2">
                            <span className="font-medium text-[var(--pf-navy)]">{row.productName}</span>
                            {row.lotCode ? <span className="block text-xs text-slate-500">Lote {row.lotCode}</span> : null}
                            {row.note ? <span className="block text-xs text-slate-500">{row.note}</span> : null}
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: tint(color, 0.12), color }}>
                              {row.typeLabel}
                            </span>
                            <span className="ml-1.5 text-xs text-slate-600">{row.cause}</span>
                            {voided ? <span className="mt-0.5 block text-xs text-slate-500">Revertida {row.voidedAtLabel}: {row.voidReason}</span> : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{row.quantityLabel}</td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${voided ? "line-through" : "text-red-700"}`}>{row.totalCost}</td>
                          <td className="px-3 py-2 text-slate-600">{row.userName}</td>
                          <td className="px-3 py-2 text-right">
                            {data.canVoid && !voided ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void onVoid(row)}
                                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                              >
                                Revertir
                              </button>
                            ) : voided ? (
                              <span className="text-xs text-slate-400">Revertida</span>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-red-50">
                      <td className="px-3 py-2.5 font-bold" colSpan={4}>
                        Total (solo activas)
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-red-700">{data.summary.total}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      ) : !error ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      ) : null}

      {formOpen && data ? (
        <LossForm
          types={data.types}
          onClose={() => setFormOpen(false)}
          onSaved={async (text) => {
            setFormOpen(false)
            setMessage(text)
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

function RankCard({
  title,
  items,
  max,
  color,
  empty,
}: {
  title: string
  items: { label: string; cost: string; costCents: number; count: number }[]
  max: number
  color: string
  empty: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-[var(--pf-navy)]">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {items.map((item) => (
            <div key={item.label} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm">
              <span className="truncate text-slate-700" title={item.label}>
                {item.label}
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-2.5 rounded-full" style={{ width: `${Math.max(4, (item.costCents / max) * 100)}%`, background: color }} />
              </span>
              <span className="whitespace-nowrap text-right tabular-nums">
                <b style={{ color }}>{item.cost}</b>
                <span className="ml-1 text-xs text-slate-400">×{item.count}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LossForm({
  types,
  onClose,
  onSaved,
}: {
  types: LossTypeInfo[]
  onClose: () => void
  onSaved: (message: string) => void | Promise<void>
}) {
  const [products, setProducts] = useState<LossProduct[]>([])
  const [query, setQuery] = useState("")
  const [product, setProduct] = useState<LossProduct | null>(null)
  const [type, setType] = useState<string>(types[0]?.code ?? "SHRINKAGE")
  const [cause, setCause] = useState("")
  const [presentationId, setPresentationId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [lotCode, setLotCode] = useState("")
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
    if (!text) return products.slice(0, 30)
    return products
      .filter(
        (item) =>
          item.name.toLowerCase().includes(text) ||
          item.code.toLowerCase().includes(text) ||
          item.barcodes.some((code) => code.toLowerCase().includes(text)),
      )
      .slice(0, 30)
  }, [products, query])

  function pick(item: LossProduct) {
    setProduct(item)
    setPresentationId(item.presentations[0]?.id ?? "")
    setLotCode(item.lots[0]?.code ?? "")
    setQuantity("1")
    setError("")
  }

  function onCode(code: string) {
    const text = code.trim().toLowerCase()
    const found = products.find((item) => item.code.toLowerCase() === text || item.barcodes.some((b) => b.toLowerCase() === text))
    if (!found) {
      setError(`Código ${code} no registrado`)
      return
    }
    playScanPit()
    pick(found)
  }

  const causes = types.find((item) => item.code === type)?.causes ?? []
  const color = TYPE_COLOR[type] ?? "#ef4444"
  const presentation = product?.presentations.find((item) => item.id === presentationId) ?? product?.presentations[0]
  const qty = Number(quantity.replace(",", ".") || 0)
  const baseQty = presentation ? qty * presentation.factor : qty
  const cost = product ? Math.round(baseQty * product.costPerBase * 100) / 100 : 0
  const overStock = product ? baseQty > product.stock + 1e-9 : false
  const needsNote = cause === "Otro" && !note.trim()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!product) return setError("Elige el producto")
    if (!cause) return setError("Elige la causa")
    if (needsNote) return setError("Describe el motivo en la nota")
    setSaving(true)
    setError("")
    try {
      const result = await registerLoss({
        productId: product.id,
        presentationId: presentation?.id,
        quantity,
        type,
        cause,
        note: note.trim() || undefined,
        lotCode: product.trackLots ? lotCode : undefined,
      })
      await onSaved(`${product.name}: ${quantity} ${presentation?.name ?? product.unit} registrado · ${result.totalCost}`)
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
      aria-label="Registrar merma"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <form
        onSubmit={onSubmit}
        className="max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-xl space-y-4 overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 shadow-xl sm:p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Registrar merma o pérdida</h2>
          <button type="button" className="text-sm text-slate-500" onClick={onClose} disabled={saving}>
            Cerrar
          </button>
        </div>

        {/* 1. Producto */}
        {product ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <ProductPhoto name={product.name} imagePath={product.imagePath} categoryId={product.categoryId} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-[var(--pf-navy)]">{product.name}</p>
              <p className="text-xs text-slate-500">
                Stock: <b>{product.stockLabel} {product.unit}</b> · costo S/ {product.costPerBase.toFixed(2)} por {product.unit}
              </p>
            </div>
            <button type="button" className="text-xs font-semibold text-[var(--pf-accent)]" onClick={() => setProduct(null)}>
              Cambiar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">1. Producto</p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre o código…"
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
              />
              <ScannerButton onCode={onCode} />
            </div>
            <CodeField onCode={onCode} placeholder="O pasa el lector de código y Enter" />
            <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => pick(item)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
                    <ProductPhoto name={item.name} imagePath={item.imagePath} categoryId={item.categoryId} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--pf-navy)]">{item.name}</span>
                    <span className={`text-xs tabular-nums ${item.stock > 0 ? "text-slate-500" : "text-red-600"}`}>
                      {item.stock > 0 ? `${item.stockLabel} ${item.unit}` : "Sin stock"}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? <li className="px-3 py-4 text-center text-sm text-slate-500">Sin coincidencias.</li> : null}
            </ul>
          </div>
        )}

        {/* 2. Tipo y causa */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">2. Tipo y causa</p>
          <div className="grid grid-cols-3 gap-1.5">
            {types.map((item) => {
              const c = TYPE_COLOR[item.code]
              const active = type === item.code
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setType(item.code)
                    setCause("")
                  }}
                  className="h-10 rounded-xl text-sm font-semibold ring-1"
                  style={active ? { background: c, color: "#fff", boxShadow: `0 0 0 1px ${c}` } : { background: "#fff", color: c, boxShadow: `0 0 0 1px ${tint(c, 0.4)}` }}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {causes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCause(item)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={cause === item ? { background: color, color: "#fff" } : { background: tint(color, 0.1), color }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Cantidad */}
        {product ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block text-sm font-medium text-slate-700">
              Cantidad
              <input
                inputMode="decimal"
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-right tabular-nums"
                value={quantity}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Presentación
              <select
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 text-sm"
                value={presentation?.id ?? ""}
                onChange={(event) => setPresentationId(event.target.value)}
              >
                {product.presentations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.factor !== 1 ? ` (${item.factor} ${product.unit})` : ""}
                  </option>
                ))}
              </select>
            </label>
            {product.trackLots ? (
              <label className="block text-sm font-medium text-slate-700">
                Lote
                <select className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 text-sm" value={lotCode} onChange={(event) => setLotCode(event.target.value)}>
                  {product.lots.length === 0 ? <option value="">Sin lotes con stock</option> : null}
                  {product.lots.map((lot) => (
                    <option key={lot.code} value={lot.code}>
                      {lot.code} · {lot.quantityLabel}
                      {lot.expiresAtLabel ? ` · vence ${lot.expiresAtLabel}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        <label className="block text-sm font-medium text-slate-700">
          Nota {cause === "Otro" ? <span className="text-red-600">(obligatoria)</span> : <span className="font-normal text-slate-400">(opcional)</span>}
          <textarea
            className="mt-1 min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ej. se rompieron al descargar, lote vencido el 15/11…"
          />
        </label>

        {product ? (
          <div className={`grid grid-cols-2 gap-2 rounded-2xl p-3 text-sm ${overStock ? "bg-red-50" : "bg-slate-50"}`}>
            <div>
              <p className="text-xs text-slate-500">Sale del stock</p>
              <p className={`text-lg font-bold tabular-nums ${overStock ? "text-red-700" : "text-[var(--pf-navy)]"}`}>
                {Number.isFinite(baseQty) ? baseQty.toLocaleString("es-PE", { maximumFractionDigits: 4 }) : "—"} {product.unit}
              </p>
              {overStock ? <p className="text-xs font-semibold text-red-700">Mayor que el stock ({product.stockLabel})</p> : null}
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Valor de la pérdida</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color }}>
                S/ {Number.isFinite(cost) ? cost.toFixed(2) : "0.00"}
              </p>
            </div>
          </div>
        ) : null}

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={saving || !product || !cause || needsNote || overStock || !(qty > 0) || (product?.trackLots && !lotCode)}
          className="h-12 w-full rounded-xl text-base font-semibold text-white shadow-sm disabled:opacity-50"
          style={{ background: color }}
        >
          {saving ? "Registrando…" : "Registrar y descontar stock"}
        </button>
      </form>
    </div>
  )
}
