import { useEffect, useMemo, useState } from "react"
import { FileSpreadsheet } from "lucide-react"
import { getInventoryKardex } from "../api"
import { DataGrid, downloadGrid, FilterBar, FilterField, filterInput, type GridColumn } from "../components/DataGrid"

type Row = Awaited<ReturnType<typeof getInventoryKardex>>["movements"][number]

export function KardexPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [product, setProduct] = useState("")
  const [type, setType] = useState("")

  useEffect(() => {
    getInventoryKardex()
      .then((data) => setRows(data.movements))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  const types = useMemo(() => [...new Set(rows.map((row) => row.typeLabel))].sort(), [rows])
  const filtered = rows.filter((row) => {
    if (desde && row.day && row.day < desde) return false
    if (hasta && row.day && row.day > hasta) return false
    if (product && !row.productName.toLowerCase().includes(product.toLowerCase())) return false
    if (type && row.typeLabel !== type) return false
    return true
  })

  const columns: GridColumn<Row>[] = [
    { key: "fecha", label: "Fecha", value: (row) => row.createdAtLabel, width: 130 },
    { key: "almacen", label: "Almacén", value: (row) => row.warehouseName },
    { key: "producto", label: "Producto", value: (row) => row.productName, width: 160 },
    { key: "tipo", label: "Tipo", value: (row) => row.typeLabel },
    {
      key: "cantidad",
      label: "Cantidad",
      align: "right",
      value: (row) => row.quantityLabel,
      render: (row) => (
        <span className={`font-semibold ${row.quantityLabel.startsWith("-") ? "text-red-600" : "text-emerald-700"}`}>{row.quantityLabel}</span>
      ),
    },
    { key: "saldo", label: "Saldo", align: "right", value: (row) => row.balanceLabel },
    { key: "responsable", label: "Responsable", value: (row) => row.userName },
    { key: "motivo", label: "Motivo", value: (row) => row.reason ?? "", width: 160, wrap: true },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-slate-500">{filtered.length} movimiento(s). Entradas, salidas y saldo después de cada movimiento.</p>
        </div>
        <FilterBar>
          <FilterField label="Desde">
            <input type="date" className={filterInput} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </FilterField>
          <FilterField label="Hasta">
            <input type="date" className={filterInput} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </FilterField>
          <FilterField label="Producto">
            <input className={`${filterInput} w-40`} placeholder="Nombre del producto" value={product} onChange={(e) => setProduct(e.target.value)} />
          </FilterField>
          <FilterField label="Tipo">
            <select className={filterInput} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Todos</option>
              {types.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </FilterField>
          <button
            type="button"
            onClick={() => downloadGrid("kardex", columns, filtered)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
        </FilterBar>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <DataGrid columns={columns} rows={filtered} rowKey={(row) => row.id} empty="Sin movimientos con estos filtros." />
    </div>
  )
}
