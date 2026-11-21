import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ChevronDown, FileSpreadsheet, Receipt, RotateCcw, Ban } from "lucide-react"
import { getSalesHistory, getSalesReturns, type HistoryFilters } from "../api"
import { DataGrid, downloadGrid, FilterBar, FilterField, filterInput, type GridColumn } from "../components/DataGrid"

type View = "ventas" | "devoluciones" | "anulaciones"
type SaleRow = Awaited<ReturnType<typeof getSalesHistory>>["sales"][number]
type ReturnRow = Awaited<ReturnType<typeof getSalesReturns>>["returns"][number]

const VIEWS: { id: View; label: string; hint: string; icon: typeof Receipt; color: string }[] = [
  { id: "ventas", label: "Ventas", hint: "Ventas confirmadas", icon: Receipt, color: "#0d9488" },
  { id: "devoluciones", label: "Devoluciones", hint: "Productos devueltos y reembolsos", icon: RotateCcw, color: "#f59e0b" },
  { id: "anulaciones", label: "Anulaciones", hint: "Ventas anuladas", icon: Ban, color: "#dc2626" },
]

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function money(cents: number) {
  return `S/ ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Historial de ventas con Ventas / Devoluciones / Anulaciones en un selector y filtros a la derecha. */
export function SalesHistoryPage({ voidedOnly = false, initialView }: { voidedOnly?: boolean; initialView?: View }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const startView: View = initialView ?? (voidedOnly || params.get("status") === "VOIDED" ? "anulaciones" : "ventas")
  const [view, setView] = useState<View>(startView)
  const [open, setOpen] = useState(false)
  const now = new Date()
  const [filters, setFilters] = useState<Required<HistoryFilters>>({
    desde: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    hasta: iso(now),
    producto: "",
    medio: "",
  })
  const [sales, setSales] = useState<SaleRow[]>([])
  const [returns, setReturns] = useState<ReturnRow[]>([])
  const [methods, setMethods] = useState<{ code: string; label: string }[]>([])
  const [canReturn, setCanReturn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      if (view === "devoluciones") {
        const data = await getSalesReturns(filters)
        setReturns(data.returns)
        setCanReturn(data.canReturn)
        if (!methods.length) {
          const meta = await getSalesHistory("COMPLETED", { desde: filters.hasta, hasta: filters.hasta })
          setMethods(meta.methods ?? [])
        }
      } else {
        const data = await getSalesHistory(view === "anulaciones" ? "VOIDED" : "COMPLETED", filters)
        setSales(data.sales)
        setMethods(data.methods ?? [])
        setCanReturn(Boolean(data.canReturn))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, filters])

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(handle)
  }, [load])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const current = VIEWS.find((item) => item.id === view)!
  const set = (key: keyof HistoryFilters) => (value: string) => setFilters((prev) => ({ ...prev, [key]: value }))

  const saleColumns: GridColumn<SaleRow>[] = [
    { key: "code", label: "Venta", value: (row) => row.code, render: (row) => <span className="font-mono font-semibold text-[var(--pf-navy)]">{row.code}</span> },
    { key: "fecha", label: "Fecha", value: (row) => row.createdAtLabel, width: 130 },
    { key: "cliente", label: "Cliente", value: (row) => row.customerName, width: 140 },
    { key: "productos", label: "Productos", value: (row) => row.products ?? "", render: (row) => <span className="line-clamp-1 max-w-[22rem] text-slate-700" title={row.products}>{row.products}</span>, width: 200 },
    { key: "pago", label: "Medio de pago", value: (row) => row.payments || "—" },
    { key: "usuario", label: "Usuario", value: (row) => row.userName },
    ...(view === "anulaciones" ? [{ key: "anulada", label: "Anulada", value: (row: SaleRow) => row.voidedAtLabel ?? "" }] : []),
    {
      key: "total",
      label: "Total",
      align: "right",
      value: (row) => row.total,
      render: (row) => <span className={`font-semibold ${view === "anulaciones" ? "text-red-600 line-through" : "text-[var(--pf-navy)]"}`}>{row.total}</span>,
    },
    {
      key: "acciones",
      label: "",
      noExport: true,
      value: () => "",
      render: (row) => (
        <span className="flex justify-end gap-1 whitespace-nowrap">
          <Link to={`/ventas/${row.id}`} className="rounded px-1.5 py-0.5 text-xs font-semibold text-[var(--pf-accent)] hover:bg-slate-100">
            Ver
          </Link>
          {view === "ventas" && canReturn ? (
            <Link to={`/ventas/devoluciones?venta=${row.id}`} className="rounded px-1.5 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">
              Devolver
            </Link>
          ) : null}
        </span>
      ),
    },
  ]

  const returnColumns: GridColumn<ReturnRow>[] = [
    { key: "fecha", label: "Fecha", value: (row) => row.createdAtLabel, width: 130 },
    {
      key: "venta",
      label: "Venta",
      value: (row) => row.saleCode,
      render: (row) => (
        <Link to={`/ventas/${row.saleId}`} className="font-mono font-semibold text-[var(--pf-accent)] hover:underline">
          {row.saleCode}
        </Link>
      ),
    },
    { key: "cliente", label: "Cliente", value: (row) => row.customerName, width: 140 },
    { key: "productos", label: "Productos devueltos", value: (row) => row.products, width: 220, wrap: true },
    { key: "reembolso", label: "Reembolso", value: (row) => row.method },
    { key: "usuario", label: "Usuario", value: (row) => row.userName },
    { key: "total", label: "Total", align: "right", value: (row) => row.total, render: (row) => <span className="font-semibold text-amber-700">{row.total}</span> },
  ]

  const saleTotal = sales.reduce((sum, row) => sum + (row.totalCents ?? 0), 0)
  const returnTotal = returns.reduce((sum, row) => sum + row.totalCents, 0)

  function exportExcel() {
    if (view === "devoluciones") downloadGrid(`devoluciones-${filters.desde}-${filters.hasta}`, returnColumns, returns)
    else downloadGrid(`${view}-${filters.desde}-${filters.hasta}`, saleColumns, sales)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          {/* Selector desplegable: Ventas (por defecto), Devoluciones, Anulaciones. */}
          <div ref={panelRef} className="relative">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="inline-flex h-11 min-w-[14rem] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-[var(--pf-navy)] shadow-sm"
            >
              <span className="grid size-7 place-items-center rounded-lg text-white" style={{ background: current.color }}>
                <current.icon size={15} />
              </span>
              {current.label}
              <ChevronDown size={16} className={`ml-auto transition ${open ? "rotate-180" : ""}`} />
            </button>
            {open ? (
              <div className="absolute left-0 top-12 z-30 w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                {VIEWS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setView(item.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left ${item.id === view ? "bg-slate-100" : "hover:bg-slate-50"}`}
                  >
                    <span className="grid size-9 place-items-center rounded-lg text-white" style={{ background: item.color }}>
                      <item.icon size={17} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-[var(--pf-navy)]">{item.label}</span>
                      <span className="block text-xs text-slate-500">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <FilterBar>
          <FilterField label="Desde">
            <input type="date" className={filterInput} value={filters.desde} onChange={(e) => set("desde")(e.target.value)} />
          </FilterField>
          <FilterField label="Hasta">
            <input type="date" className={filterInput} value={filters.hasta} onChange={(e) => set("hasta")(e.target.value)} />
          </FilterField>
          <FilterField label="Producto">
            <input className={`${filterInput} w-40`} placeholder="Nombre del producto" value={filters.producto} onChange={(e) => set("producto")(e.target.value)} />
          </FilterField>
          <FilterField label={view === "devoluciones" ? "Reembolso" : "Medio de pago"}>
            <select className={filterInput} value={filters.medio} onChange={(e) => set("medio")(e.target.value)}>
              <option value="">Todos</option>
              {view === "devoluciones" ? <option value="CREDIT">A la deuda del cliente</option> : null}
              {view !== "devoluciones" && !methods.some((item) => item.code === "CREDIT") ? <option value="CREDIT">Crédito</option> : null}
              {methods.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </FilterField>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
          {view === "devoluciones" && canReturn ? (
            <button
              type="button"
              onClick={() => navigate("/ventas/devoluciones")}
              className="h-10 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-white"
            >
              Nueva devolución
            </button>
          ) : null}
        </FilterBar>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <p className="text-sm text-slate-500">
        {loading
          ? "Cargando…"
          : view === "devoluciones"
            ? `${returns.length} devolución(es) · ${money(returnTotal)}`
            : `${sales.length} venta(s) · ${money(saleTotal)}`}
      </p>

      {view === "devoluciones" ? (
        <DataGrid
          columns={returnColumns}
          rows={returns}
          rowKey={(row) => row.id}
          empty="No hay devoluciones con estos filtros."
          footer={["", "", "", "", "", "Total", money(returnTotal)]}
        />
      ) : (
        <DataGrid
          columns={saleColumns}
          rows={sales}
          rowKey={(row) => row.id}
          empty={view === "anulaciones" ? "No hay ventas anuladas con estos filtros." : "No hay ventas con estos filtros."}
          footer={saleColumns.map((column, index) => (column.key === "total" ? money(saleTotal) : index === saleColumns.length - 3 ? "Total" : ""))}
        />
      )}
    </div>
  )
}
