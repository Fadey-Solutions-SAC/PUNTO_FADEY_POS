import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, ArrowLeftRight, Boxes, ChevronRight, DollarSign, Package, Pencil, Plus, Search, SlidersHorizontal, Store, Warehouse } from "lucide-react"
import { deleteWarehouseApi, getInventoryWarehouses } from "../api"

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

  const totals = data?.totals

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Almacenes</h1>
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
                        <Link to="/inventario/transferencias" className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100">
                          <ArrowLeftRight size={13} /> Mover a almacén
                        </Link>
                        <Link to="/inventario/ajustes" className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                          <SlidersHorizontal size={13} /> Ajustar
                        </Link>
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
