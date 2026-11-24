import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, ArrowLeftRight, Boxes, ChevronRight, DollarSign, FileDown, FileUp, Package, Pencil, Plus, Search, SlidersHorizontal, Store, Warehouse } from "lucide-react"
import {
  deleteWarehouseApi,
  downloadStockSheet,
  getInventoryWarehouses,
  postInventoryAdjustment,
  sendInventoryTransfer,
  uploadStockSheet,
  type StockSheetChange,
} from "../api"

type Data = Awaited<ReturnType<typeof getInventoryWarehouses>>

const PALETTE = ["#0d9488", "#8b5cf6", "#0ea5e9", "#f59e0b", "#ec4899", "#6366f1"]

const STATE_STYLE: Record<string, string> = {
  Normal: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Bajo: "bg-amber-50 text-amber-800 ring-amber-200",
  Agotado: "bg-red-50 text-red-700 ring-red-200",
}

function qty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("es-PE", { maximumFractionDigits: 4 })
}

/** Inventario → Almacenes: cuadros por almacén y, abajo, sus productos con stock, precios y valor. */
export function WarehousesPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [selectedId, setSelectedId] = useState("") // "" = Todos
  const [query, setQuery] = useState("")
  const [onlyLow, setOnlyLow] = useState(false)
  // Ventanas emergentes: mover a otro almacén o ajustar el stock, sin salir de esta pantalla.
  const [dialog, setDialog] = useState<{ kind: "move" | "adjust"; productId: string } | null>(null)
  // Plantilla Excel de stock: archivo subido y su vista previa de cambios.
  const [sheet, setSheet] = useState<{ file: File; rows: number; changes: StockSheetChange[]; errors: string[] } | null>(null)
  const [sheetBusy, setSheetBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(
    () =>
      getInventoryWarehouses()
        .then(setData)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error")),
    [],
  )

  useEffect(() => {
    void load()
  }, [load])

  const warehouses = useMemo(() => (data?.warehouses ?? []).filter((item) => item.isActive !== false), [data])
  const colorOf = (id: string) => PALETTE[Math.max(0, warehouses.findIndex((item) => item.id === id)) % PALETTE.length]
  const selected = warehouses.find((item) => item.id === selectedId) ?? null

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (data?.products ?? []).filter((row) => {
      if (selectedId && !(row.byWarehouse[selectedId] > 0)) return false
      if (onlyLow && row.state === "Normal") return false
      if (term && !`${row.name} ${row.brand}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [data, selectedId, query, onlyLow])

  async function onDelete(id: string, name: string) {
    if (!window.confirm(`¿Eliminar el almacén ${name}? Solo se puede si nunca tuvo movimientos.`)) return
    setError("")
    setMessage("")
    try {
      await deleteWarehouseApi(id)
      if (selectedId === id) setSelectedId("")
      await load()
      setMessage(`Almacén ${name} eliminado`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar")
    }
  }

  async function onDownloadSheet() {
    setError("")
    setMessage("")
    setSheetBusy(true)
    try {
      await downloadStockSheet()
      setMessage("Plantilla descargada: cambia las cantidades de las columnas amarillas y súbela con «Subir plantilla»")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar")
    } finally {
      setSheetBusy(false)
    }
  }

  async function onPickSheet(file: File | undefined) {
    if (!file) return
    setError("")
    setMessage("")
    setSheetBusy(true)
    try {
      const preview = await uploadStockSheet(file, false)
      setSheet({ file, ...preview })
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la plantilla")
    } finally {
      setSheetBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const totals = data?.totals

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Boxes size={20} />} color="#6366f1" label="Total ítems" value={String(totals?.items ?? "…")} />
        <Kpi icon={<DollarSign size={20} />} color="#0d9488" label="Valor inventario" value={totals?.value ?? "…"} hint="a precio de venta" />
        <Kpi icon={<ArrowLeftRight size={20} />} color="#f59e0b" label="Inversión inventario" value={totals?.cost ?? "…"} hint="a costo" />
        <Kpi icon={<Package size={20} />} color="#0ea5e9" label="Unidades totales" value={totals ? qty(totals.units) : "…"} />
      </div>

      {/* Cuadros de almacenes */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <WarehouseCard
          active={selectedId === ""}
          color="#334155"
          icon={<Store size={20} />}
          title="Todos"
          lines={[
            "Vista consolidada de todos los almacenes",
            <>
              Productos: <b>{data?.products?.length ?? 0}</b>
            </>,
          ]}
          onSelect={() => setSelectedId("")}
        />
        {warehouses.map((warehouse) => {
          const deletable = data?.canManage && warehouse.branchId === data.currentBranchId && !warehouse.isDefault && !warehouse.inUse
          return (
            <WarehouseCard
              key={warehouse.id}
              active={selectedId === warehouse.id}
              color={colorOf(warehouse.id)}
              icon={<Warehouse size={20} />}
              title={warehouse.name}
              lines={[
                `${warehouse.isDefault ? "Almacén principal" : "Almacén"} · ${warehouse.branch}${warehouse.inUse ? " · trabajando aquí" : ""}`,
                <>
                  Productos con stock: <b>{warehouse.withStock ?? warehouse.rows.length}</b>
                </>,
              ]}
              onSelect={() => setSelectedId(warehouse.id)}
              onDelete={deletable ? () => void onDelete(warehouse.id, warehouse.name) : undefined}
            />
          )
        })}
      </div>

      {/* Alerta y acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {totals && totals.low > 0 ? (
          <button
            type="button"
            onClick={() => setOnlyLow((value) => !value)}
            className={`flex min-w-[16rem] items-center gap-3 rounded-2xl border px-4 py-3 text-left ${onlyLow ? "border-red-400 bg-red-100" : "border-red-200 bg-red-50"}`}
          >
            <AlertTriangle className="text-red-600" size={22} />
            <span className="flex-1">
              <span className="block font-semibold text-red-700">Productos con bajo stock</span>
              <span className="block text-xs text-red-600">
                {totals.low} producto(s) requieren reposición {onlyLow ? "· mostrando solo estos" : ""}
              </span>
            </span>
            <ChevronRight className="text-red-500" size={18} />
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onDownloadSheet()}
            disabled={sheetBusy}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
          >
            <FileDown size={16} /> Descargar plantilla
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sheetBusy}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-50 px-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50"
          >
            <FileUp size={16} /> {sheetBusy ? "Leyendo…" : "Subir plantilla"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => void onPickSheet(event.target.files?.[0])}
          />
          <Link to="/productos/nuevo" className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-600 px-4 text-sm font-semibold text-white">
            <Plus size={16} /> Nuevo producto
          </Link>
          <Link to="/configuracion?m=almacenes" className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[var(--pf-navy)]">
            <Plus size={16} /> Nuevo almacén
          </Link>
        </div>
      </div>

      {/* Productos del almacén elegido (o de todos) */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-[var(--pf-navy)]">
            {selected ? selected.name : "Todos los almacenes"} · {rows.length} producto(s)
          </p>
          <div className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 sm:max-w-md">
            <Search size={16} className="text-slate-400" />
            <input className="h-10 min-w-0 flex-1 text-sm outline-none" placeholder="Buscar producto o marca…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-2 py-2 font-semibold">Producto</th>
                <th className="px-2 py-2 font-semibold">Marca</th>
                <th className="px-2 py-2 text-right font-semibold">Precio venta</th>
                <th className="px-2 py-2 text-right font-semibold">P. compra</th>
                <th className="px-2 py-2 font-semibold">Por almacén</th>
                <th className="px-2 py-2 text-right font-semibold">{selected ? "Stock aquí" : "Stock total"}</th>
                <th className="px-2 py-2 text-right font-semibold">Valor</th>
                <th className="px-2 py-2 font-semibold">Estado</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const parts = warehouses.filter((item) => (row.byWarehouse[item.id] ?? 0) !== 0)
                return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-2 py-2 font-semibold text-[var(--pf-navy)]">{row.name}</td>
                    <td className="px-2 py-2 text-slate-500">{row.brand}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.salePrice}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">{row.costPrice}</td>
                    <td className="px-2 py-2">
                      {parts.length === 0 ? (
                        <span className="text-slate-400">Sin stock</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {parts.map((item) => (
                            <span key={item.id} className="rounded-md px-1.5 py-0.5 text-xs font-semibold" style={{ background: `${colorOf(item.id)}18`, color: colorOf(item.id) }}>
                              {item.name}: {qty(row.byWarehouse[item.id])}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">
                      {selected ? `${qty(row.byWarehouse[selected.id] ?? 0)} ${row.unit}` : row.totalLabel}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.value}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATE_STYLE[row.state] ?? STATE_STYLE.Normal}`}>{row.state}</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex justify-end gap-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "move", productId: row.id })}
                          className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                        >
                          <ArrowLeftRight size={13} /> Mover a almacén
                        </button>
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "adjust", productId: row.id })}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                        >
                          <SlidersHorizontal size={13} /> Ajustar
                        </button>
                        <Link to={`/productos/${row.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          <Pencil size={13} /> Editar
                        </Link>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data && rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No hay productos para mostrar.</p> : null}
          {!data ? <p className="py-8 text-center text-sm text-slate-500">Cargando…</p> : null}
        </div>
      </section>

      {dialog && data ? (
        <StockDialog
          kind={dialog.kind}
          product={(data.products ?? []).find((item) => item.id === dialog.productId)!}
          warehouses={warehouses}
          preferredId={selectedId || data.currentWarehouseId}
          onClose={() => setDialog(null)}
          onDone={async (text) => {
            setDialog(null)
            setError("")
            setMessage(text)
            await load()
          }}
        />
      ) : null}

      {sheet ? (
        <StockSheetDialog
          sheet={sheet}
          onClose={() => setSheet(null)}
          onDone={async (text, failed) => {
            setSheet(null)
            setMessage(text)
            setError(failed.length ? `No se ajustaron: ${failed.join(" · ")}` : "")
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

/** Vista previa de la plantilla subida: cuadro con lo que cambia y botón para aplicar los ajustes. */
function StockSheetDialog({
  sheet,
  onClose,
  onDone,
}: {
  sheet: { file: File; rows: number; changes: StockSheetChange[]; errors: string[] }
  onClose: () => void
  onDone: (message: string, failed: string[]) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const count = sheet.changes.length

  async function onApply() {
    setBusy(true)
    setError("")
    try {
      const result = await uploadStockSheet(sheet.file, true)
      await onDone(`Plantilla aplicada: ${result.applied} ajuste(s) de stock guardados (quedan en el kardex)`, result.failed)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aplicar")
      setBusy(false)
    }
  }

  const cell = "border border-slate-300 px-2 py-1.5"
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[var(--pf-navy)]/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Subir plantilla de stock"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Plantilla de stock</h2>
            <p className="text-sm text-slate-500">
              {sheet.file.name} · {sheet.rows} producto(s) leídos · {count ? `${count} cambio(s) de stock` : "sin cambios de stock"}
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>

        {sheet.errors.length ? (
          <ul className="max-h-28 list-disc overflow-auto rounded-xl bg-amber-50 py-2 pl-7 pr-3 text-xs text-amber-800">
            {sheet.errors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}

        {count ? (
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-300">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-slate-800 text-white">
                <tr>
                  <th className={`${cell} font-semibold`}>Producto</th>
                  <th className={`${cell} font-semibold`}>Almacén</th>
                  <th className={`${cell} text-right font-semibold`}>Stock actual</th>
                  <th className={`${cell} text-right font-semibold`}>Stock nuevo</th>
                  <th className={`${cell} text-right font-semibold`}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {sheet.changes.map((change) => (
                  <tr key={`${change.productId}-${change.warehouseId}`}>
                    <td className={`${cell} font-semibold text-[var(--pf-navy)]`}>{change.product}</td>
                    <td className={`${cell} text-slate-600`}>{change.warehouse}</td>
                    <td className={`${cell} text-right tabular-nums`}>
                      {change.current} {change.unit}
                    </td>
                    <td className={`${cell} bg-yellow-50 text-right font-bold tabular-nums`}>
                      {change.next} {change.unit}
                    </td>
                    <td className={`${cell} text-right font-semibold tabular-nums ${change.diff.startsWith("-") ? "text-red-600" : "text-emerald-700"}`}>
                      {change.diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            Las cantidades son iguales al stock actual. Cambia las columnas amarillas «Stock …» y vuelve a subir la plantilla.
          </p>
        )}

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="button"
          onClick={() => void onApply()}
          disabled={busy || !count}
          className="h-12 w-full rounded-xl bg-[var(--pf-accent)] text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {busy ? "Guardando…" : `Aplicar ${count} ajuste(s) de stock`}
        </button>
      </div>
    </div>
  )
}

type Product =NonNullable<Data["products"]>[number]

/** Mover a almacén (se envía y se recibe al instante) o ajustar el stock real de un almacén. */
function StockDialog({
  kind,
  product,
  warehouses,
  preferredId,
  onClose,
  onDone,
}: {
  kind: "move" | "adjust"
  product: Product
  warehouses: Data["warehouses"]
  preferredId: string
  onClose: () => void
  onDone: (message: string) => Promise<void>
}) {
  const stockIn = (id: string) => product.byWarehouse[id] ?? 0
  const withStock = warehouses.filter((item) => stockIn(item.id) > 0)
  const firstFrom = kind === "move" ? (stockIn(preferredId) > 0 ? preferredId : withStock[0]?.id ?? preferredId) : preferredId
  const [fromId, setFromId] = useState(firstFrom)
  const [toId, setToId] = useState(() => warehouses.find((item) => item.id !== firstFrom)?.id ?? "")
  const [quantity, setQuantity] = useState(() => (kind === "adjust" ? qty(stockIn(firstFrom)).replace(/,/g, "") : ""))
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const unitOption = product.baseUnitId ? `unit:${product.baseUnitId}` : undefined
  const fromName = warehouses.find((item) => item.id === fromId)?.name ?? ""
  const toName = warehouses.find((item) => item.id === toId)?.name ?? ""
  const amount = Number(quantity.replace(",", "."))

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    if (!(amount >= 0) || quantity.trim() === "" || (kind === "move" && amount <= 0)) {
      setError("Escribe una cantidad válida")
      return
    }
    if (kind === "move") {
      if (!toId || toId === fromId) {
        setError("Elige un almacén de destino distinto")
        return
      }
      if (amount > stockIn(fromId)) {
        setError(`En ${fromName} solo hay ${qty(stockIn(fromId))} ${product.unit}`)
        return
      }
    }
    setBusy(true)
    try {
      if (kind === "move") {
        await sendInventoryTransfer({
          fromWarehouseId: fromId,
          toWarehouseId: toId,
          notes: reason.trim() || "Movido desde Almacenes",
          lines: [{ productId: product.id, quantity: String(amount), presentationId: unitOption }],
          receiveNow: true,
        })
        await onDone(`${product.name}: ${qty(amount)} ${product.unit} movidos de ${fromName} a ${toName}`)
      } else {
        await postInventoryAdjustment({
          productId: product.id,
          warehouseId: fromId,
          presentationId: unitOption,
          quantity: String(amount),
          reason: reason.trim() || "Ajuste desde Almacenes",
        })
        await onDone(`${product.name}: stock en ${fromName} ajustado a ${qty(amount)} ${product.unit}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
      setBusy(false)
    }
  }

  const field = "mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[var(--pf-navy)]/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={kind === "move" ? "Mover a almacén" : "Ajustar stock"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--pf-navy)]">{kind === "move" ? "Mover a almacén" : "Ajustar stock"}</h2>
            <p className="text-sm text-slate-500">
              {product.name} · total {product.totalLabel}
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          {kind === "move" ? "Desde" : "Almacén"}
          <select
            className={field}
            value={fromId}
            onChange={(event) => {
              const next = event.target.value
              setFromId(next)
              if (kind === "adjust") setQuantity(qty(stockIn(next)).replace(/,/g, ""))
              if (next === toId) setToId(warehouses.find((item) => item.id !== next)?.id ?? "")
            }}
          >
            {(kind === "move" && withStock.length ? withStock : warehouses).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {qty(stockIn(item.id))} {product.unit}
              </option>
            ))}
          </select>
        </label>

        {kind === "move" ? (
          <label className="block text-sm font-medium text-slate-700">
            Hacia
            <select className={field} value={toId} onChange={(event) => setToId(event.target.value)}>
              {warehouses
                .filter((item) => item.id !== fromId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {qty(stockIn(item.id))} {product.unit}
                  </option>
                ))}
            </select>
            {warehouses.length < 2 ? <span className="mt-1 block text-xs text-red-600">Crea otro almacén en Configuración → Almacenes.</span> : null}
          </label>
        ) : null}

        <label className="block text-sm font-medium text-slate-700">
          {kind === "move" ? `Cantidad a mover (${product.unit})` : `Stock real en ${fromName} (${product.unit})`}
          <input
            autoFocus
            inputMode="decimal"
            className={`${field} text-right text-lg font-semibold tabular-nums`}
            placeholder={kind === "move" ? "Ej. 5" : "Ej. 18"}
            value={quantity}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setQuantity(event.target.value)}
          />
          {kind === "adjust" && quantity.trim() !== "" && amount >= 0 ? (
            <span className={`mt-1 block text-xs ${amount - stockIn(fromId) < 0 ? "text-red-600" : "text-emerald-700"}`}>
              Ahora: {qty(stockIn(fromId))} {product.unit} · diferencia {amount - stockIn(fromId) > 0 ? "+" : ""}
              {qty(amount - stockIn(fromId))} {product.unit}
            </span>
          ) : null}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          {kind === "move" ? "Nota (opcional)" : "Motivo"}
          <input
            className={field}
            placeholder={kind === "move" ? "Ej. reposición de tienda" : "Ej. conteo físico, producto roto"}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || (kind === "move" && warehouses.length < 2)}
          className={`h-12 w-full rounded-xl text-sm font-semibold text-white shadow-sm disabled:opacity-50 ${kind === "move" ? "bg-violet-600" : "bg-[var(--pf-accent)]"}`}
        >
          {busy ? "Guardando…" : kind === "move" ? "Mover ahora" : "Guardar ajuste"}
        </button>
      </form>
    </div>
  )
}

function Kpi({ icon, color, label, value, hint }: { icon: ReactNode; color: string; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: `${color}18`, color }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
        <span className="block truncate text-xl font-bold tabular-nums text-[var(--pf-navy)]">{value}</span>
        {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
      </span>
    </div>
  )
}

function WarehouseCard({
  active,
  color,
  icon,
  title,
  lines,
  onSelect,
  onDelete,
}: {
  active: boolean
  color: string
  icon: ReactNode
  title: string
  lines: ReactNode[]
  onSelect: () => void
  onDelete?: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect()
      }}
      className="flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 text-left transition hover:shadow-md"
      style={{
        borderColor: active ? color : `${color}33`,
        background: active ? `${color}14` : `${color}08`,
        boxShadow: active ? `0 0 0 2px ${color}55` : undefined,
      }}
    >
      <span className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl text-white" style={{ background: color }}>
          {icon}
        </span>
        <span className="flex-1 truncate text-lg font-semibold" style={{ color: active ? color : "var(--pf-navy)" }}>
          {title}
        </span>
        <ChevronRight size={18} className="text-slate-400" />
      </span>
      {lines.map((line, index) => (
        <span key={index} className="text-sm text-slate-600">
          {line}
        </span>
      ))}
      {onDelete ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          className="self-end text-sm font-medium hover:underline"
          style={{ color }}
        >
          Eliminar almacén
        </button>
      ) : (
        <span className="mt-auto" />
      )}
    </div>
  )
}
