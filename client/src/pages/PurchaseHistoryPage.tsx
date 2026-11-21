import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { FileSpreadsheet } from "lucide-react"
import { getPurchaseHistory } from "../api"
import { DataGrid, downloadGrid, FilterBar, FilterField, filterInput, type GridColumn } from "../components/DataGrid"

type Row = Awaited<ReturnType<typeof getPurchaseHistory>>["purchases"][number]

const STATUS_STYLE: Record<string, string> = {
  Recibida: "bg-emerald-50 text-emerald-700",
  Pendiente: "bg-amber-50 text-amber-800",
  Anulada: "bg-red-50 text-red-700",
}

export function PurchaseHistoryPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [supplier, setSupplier] = useState("")
  const [status, setStatus] = useState("")

  useEffect(() => {
    getPurchaseHistory()
      .then((data) => setRows(data.purchases))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  const statuses = useMemo(() => [...new Set(rows.map((row) => row.statusLabel))].sort(), [rows])
  const filtered = rows.filter((row) => {
    if (desde && row.day && row.day < desde) return false
    if (hasta && row.day && row.day > hasta) return false
    if (supplier && !`${row.supplierName} ${row.documentNumber}`.toLowerCase().includes(supplier.toLowerCase())) return false
    if (status && row.statusLabel !== status) return false
    return true
  })

  const columns: GridColumn<Row>[] = [
    { key: "fecha", label: "Fecha", value: (row) => row.createdAtLabel, width: 130 },
    {
      key: "proveedor",
      label: "Proveedor",
      value: (row) => row.supplierName,
      render: (row) => (
        <Link to={`/compras/${row.id}`} className="font-medium text-[var(--pf-accent)] hover:underline">
          {row.supplierName}
        </Link>
      ),
      width: 160,
    },
    { key: "documento", label: "Documento", value: (row) => row.documentNumber },
    {
      key: "estado",
      label: "Estado",
      value: (row) => row.statusLabel,
      render: (row) => (
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[row.statusLabel] ?? "bg-slate-100 text-slate-600"}`}>{row.statusLabel}</span>
      ),
    },
    { key: "total", label: "Total", align: "right", value: (row) => row.total, render: (row) => <span className="font-semibold">{row.total}</span> },
    {
      key: "deuda",
      label: "Deuda",
      align: "right",
      value: (row) => row.debt,
      render: (row) => <span className={/[1-9]/.test(row.debt) ? "font-semibold text-red-600" : "text-slate-400"}>{row.debt}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-slate-500">{filtered.length} compra(s). Una pendiente no mueve existencias hasta recibirla.</p>
        </div>
        <FilterBar>
          <FilterField label="Desde">
            <input type="date" className={filterInput} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </FilterField>
          <FilterField label="Hasta">
            <input type="date" className={filterInput} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </FilterField>
          <FilterField label="Proveedor o documento">
            <input className={`${filterInput} w-44`} placeholder="Ej. Alicorp, F001-123" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </FilterField>
          <FilterField label="Estado">
            <select className={filterInput} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </FilterField>
          <button
            type="button"
            onClick={() => downloadGrid("historial-compras", columns, filtered)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
        </FilterBar>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <DataGrid columns={columns} rows={filtered} rowKey={(row) => row.id} empty="Sin compras con estos filtros." />
    </div>
  )
}
