import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { FileSpreadsheet } from "lucide-react"
import { getCashHistory } from "../api"
import { DataGrid, downloadGrid, FilterBar, FilterField, filterInput, type GridColumn } from "../components/DataGrid"

type Row = Awaited<ReturnType<typeof getCashHistory>>["sessions"][number]

export function CashHistoryPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [register, setRegister] = useState("")
  const [user, setUser] = useState("")
  const [status, setStatus] = useState("")

  useEffect(() => {
    let cancelled = false
    getCashHistory()
      .then((data) => {
        if (!cancelled) setRows(data.sessions)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const registers = useMemo(() => [...new Set(rows.map((row) => row.registerName))].sort(), [rows])
  const users = useMemo(() => [...new Set(rows.map((row) => row.userName))].sort(), [rows])
  const filtered = rows.filter((row) => {
    if (desde && row.day && row.day < desde) return false
    if (hasta && row.day && row.day > hasta) return false
    if (register && row.registerName !== register) return false
    if (user && row.userName !== user) return false
    if (status && row.status !== status) return false
    return true
  })

  const columns: GridColumn<Row>[] = [
    { key: "apertura", label: "Apertura", value: (row) => row.openedAtLabel, width: 130 },
    { key: "caja", label: "Caja", value: (row) => row.registerName },
    { key: "usuario", label: "Usuario", value: (row) => row.userName },
    {
      key: "estado",
      label: "Estado",
      value: (row) => (row.status === "OPEN" ? "Abierta" : "Cerrada"),
      render: (row) => (
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${row.status === "OPEN" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {row.status === "OPEN" ? "Abierta" : "Cerrada"}
        </span>
      ),
    },
    { key: "inicial", label: "Monto inicial", align: "right", value: (row) => row.opening.label },
    {
      key: "esperado",
      label: "Esperado",
      align: "right",
      value: (row) => row.expected?.label ?? "—",
      render: (row) => <span className="font-semibold">{row.expected?.label ?? "—"}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-slate-500">
            {filtered.length} sesión(es).{" "}
            <Link to="/caja" className="font-medium text-[var(--pf-accent)] hover:underline">
              Volver a caja
            </Link>
          </p>
        </div>
        <FilterBar>
          <FilterField label="Desde">
            <input type="date" className={filterInput} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </FilterField>
          <FilterField label="Hasta">
            <input type="date" className={filterInput} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </FilterField>
          <FilterField label="Caja">
            <select className={filterInput} value={register} onChange={(e) => setRegister(e.target.value)}>
              <option value="">Todas</option>
              {registers.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Usuario">
            <select className={filterInput} value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">Todos</option>
              {users.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Estado">
            <select className={filterInput} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todas</option>
              <option value="OPEN">Abiertas</option>
              <option value="CLOSED">Cerradas</option>
            </select>
          </FilterField>
          <button
            type="button"
            onClick={() => downloadGrid("historial-caja", columns, filtered)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
        </FilterBar>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <DataGrid columns={columns} rows={filtered} rowKey={(row) => row.id} empty="Sin sesiones con estos filtros." />
    </div>
  )
}
