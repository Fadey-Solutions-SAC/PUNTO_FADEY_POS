import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { FileSpreadsheet } from "lucide-react"
import { getCustomerHistory } from "../api"
import { DataGrid, downloadGrid, FilterBar, FilterField, filterInput, type GridColumn } from "../components/DataGrid"

type Data = Awaited<ReturnType<typeof getCustomerHistory>>
type Row = Data["sales"][number]

export function CustomerHistoryPage() {
  const [customerId, setCustomerId] = useState("")
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [type, setType] = useState("")

  useEffect(() => {
    getCustomerHistory(customerId || undefined)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [customerId])

  const rows = (data?.sales ?? []).filter((row) => {
    if (desde && row.day && row.day < desde) return false
    if (hasta && row.day && row.day > hasta) return false
    if (type && row.typeLabel !== type) return false
    return true
  })

  const columns: GridColumn<Row>[] = [
    { key: "fecha", label: "Fecha", value: (row) => row.createdAtLabel, width: 130 },
    { key: "cliente", label: "Cliente", value: (row) => row.customerName, width: 160 },
    {
      key: "tipo",
      label: "Tipo",
      value: (row) => row.typeLabel,
      render: (row) => (
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${row.typeLabel === "Crédito" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
          {row.typeLabel}
        </span>
      ),
    },
    { key: "total", label: "Total", align: "right", value: (row) => row.total, render: (row) => <span className="font-semibold">{row.total}</span> },
    {
      key: "ver",
      label: "",
      noExport: true,
      value: () => "",
      render: (row) => (
        <Link to={`/ventas/${row.id}`} className="text-xs font-semibold text-[var(--pf-accent)] hover:underline">
          Ver
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-slate-500">{rows.length} compra(s) de clientes.</p>
        </div>
        <FilterBar>
          <FilterField label="Cliente">
            <select className={`${filterInput} max-w-[14rem]`} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Todos</option>
              {(data?.customers ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Desde">
            <input type="date" className={filterInput} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </FilterField>
          <FilterField label="Hasta">
            <input type="date" className={filterInput} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </FilterField>
          <FilterField label="Tipo">
            <select className={filterInput} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Todos</option>
              <option value="Contado">Contado</option>
              <option value="Crédito">Crédito</option>
            </select>
          </FilterField>
          <button
            type="button"
            onClick={() => downloadGrid("historial-clientes", columns, rows)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
        </FilterBar>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} empty="Sin compras con estos filtros." />
    </div>
  )
}
