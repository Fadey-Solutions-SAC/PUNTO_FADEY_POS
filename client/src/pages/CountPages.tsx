import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ClipboardCheck, Download, Equal, EyeOff, FileSpreadsheet, Plus, Printer, Save, Scale } from "lucide-react"
import {
  cancelCount,
  closeCount,
  createCount,
  getCount,
  getCounts,
  saveCountLines,
  type CountDetail,
  type CountLine,
} from "../api"
import { CodeField, playScanPit, ScannerButton } from "../components/Scanner"
import { DataGrid, downloadGrid, type GridColumn } from "../components/DataGrid"

const RED = "#dc2626"
const BLUE = "#2563eb"
const GREEN = "#059669"

function money(value: number, currency = "PEN") {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency, minimumFractionDigits: 2 }).format(value)
}

function qty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("es-PE", { maximumFractionDigits: 4 })
}

function parseQty(text: string) {
  const value = Number(text.trim().replace(",", "."))
  return text.trim() === "" || !Number.isFinite(value) || value < 0 ? null : value
}

// ---------------------------------------------------------------- Listado

type CountMode = "BLIND" | "CORRECTION" | "DIFFERENCES"

/** Los tres tipos de inventario; cada uno funciona por separado y tiene su propio informe. */
export const COUNT_TYPES: { id: CountMode; label: string; text: string; report: string; color: string; icon: typeof EyeOff }[] = [
  {
    id: "BLIND",
    label: "Inventario ciego",
    text: "Cuentan sin ver el stock del sistema. Te informa las diferencias y no modifica nada.",
    report: "conteo_ciego",
    color: "#6366f1",
    icon: EyeOff,
  },
  {
    id: "CORRECTION",
    label: "Corrección de stock",
    text: "Compara con el sistema y ajusta la cantidad de cada producto. Queda en el kardex.",
    report: "conteo_correccion",
    color: "#0d9488",
    icon: ClipboardCheck,
  },
  {
    id: "DIFFERENCES",
    label: "Faltas y sobras",
    text: "Compara con el sistema y te informa lo que falta y lo que sobra, con su valor. No modifica.",
    report: "conteo_faltas",
    color: "#f59e0b",
    icon: Scale,
  },
]

type CountRow = Awaited<ReturnType<typeof getCounts>>["counts"][number]

export function CountsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<Awaited<ReturnType<typeof getCounts>> | null>(null)
  const [error, setError] = useState("")
  const [brandId, setBrandId] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [typeFilter, setTypeFilter] = useState("")

  useEffect(() => {
    getCounts()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function onStart(event: FormEvent, mode: CountMode) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const created = await createCount({ mode, brandId: brandId || undefined, note: note.trim() || undefined })
      navigate(`/inventario/conteo/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar")
      setBusy(false)
    }
  }

  const rows = (data?.counts ?? []).filter((row) => !typeFilter || row.mode === typeFilter)
  const columns: GridColumn<CountRow>[] = [
    { key: "numero", label: "N.º", value: (row) => String(row.number), render: (row) => <b className="text-[var(--pf-navy)]">{row.number}</b> },
    {
      key: "tipo",
      label: "Tipo",
      value: (row) => row.modeLabel ?? "",
      render: (row) => {
        const type = COUNT_TYPES.find((item) => item.id === row.mode)
        return (
          <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: type?.color ?? "#64748b" }}>
            {row.modeLabel}
          </span>
        )
      },
    },
    { key: "fecha", label: "Fecha", value: (row) => row.closedAtLabel || row.createdAtLabel },
    { key: "almacen", label: "Almacén", value: (row) => row.warehouseName },
    { key: "alcance", label: "Alcance", value: (row) => row.scope },
    { key: "usuario", label: "Usuario", value: (row) => row.userName },
    {
      key: "estado",
      label: "Estado",
      value: (row) => row.statusLabel,
      render: (row) => (
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
            row.status === "OPEN" ? "bg-amber-50 text-amber-800" : row.status === "CLOSED" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {row.statusLabel}
        </span>
      ),
    },
    {
      key: "contados",
      label: "Contados",
      align: "right",
      value: (row) => (row.status === "CLOSED" ? `${row.countedItems} · ${row.diffItems} dif.` : `${row.products} prod.`),
    },
    {
      key: "faltante",
      label: "Faltante",
      align: "right",
      value: (row) => (row.status === "CLOSED" ? row.shortage : "—"),
      render: (row) => (
        <span className="font-semibold" style={{ color: RED }}>
          {row.status === "CLOSED" ? row.shortage : "—"}
        </span>
      ),
    },
    {
      key: "sobrante",
      label: "Sobrante",
      align: "right",
      value: (row) => (row.status === "CLOSED" ? row.surplus : "—"),
      render: (row) => (
        <span className="font-semibold" style={{ color: BLUE }}>
          {row.status === "CLOSED" ? row.surplus : "—"}
        </span>
      ),
    },
    {
      key: "neto",
      label: "Neto",
      align: "right",
      value: (row) => (row.status === "CLOSED" ? row.net : "—"),
      render: (row) => <b style={{ color: row.netCents < 0 ? RED : row.netCents > 0 ? BLUE : GREEN }}>{row.status === "CLOSED" ? row.net : "—"}</b>,
    },
    {
      key: "ver",
      label: "",
      noExport: true,
      value: () => "",
      render: (row) => (
        <Link to={`/inventario/conteo/${row.id}`} className="text-xs font-semibold text-[var(--pf-accent)]">
          {row.status === "OPEN" ? "Continuar" : "Ver"}
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-slate-500">
            Elige el tipo de inventario para {data?.warehouseName ?? "el almacén"}. Cada uno funciona por separado y tiene su propio informe.
          </p>
        </div>
        <Link to="/inventario/informes?grupo=conteo_correccion" className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--pf-accent)] hover:bg-slate-100">
          Informes de inventario →
        </Link>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {data?.openId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            <b>Hay un inventario en curso</b> en este almacén. Tu avance está guardado.
          </p>
          <Link to={`/inventario/conteo/${data.openId}`} className="h-11 rounded-xl bg-amber-500 px-5 text-sm font-semibold leading-[2.75rem] text-white">
            Continuar
          </Link>
        </div>
      ) : data?.canManage ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              ¿Qué vas a contar?
              <select className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 text-sm" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">Todos los productos</option>
                {(data.brands ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    Marca {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Nota <span className="font-normal text-slate-400">(opcional)</span>
              <input className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. cierre de mes" />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {COUNT_TYPES.map((type) => (
              <form key={type.id} onSubmit={(event) => void onStart(event, type.id)} className="flex flex-col gap-2 rounded-2xl border-2 p-3" style={{ borderColor: `${type.color}55` }}>
                <span className="flex items-center gap-2 font-semibold text-[var(--pf-navy)]">
                  <span className="grid size-9 place-items-center rounded-xl text-white" style={{ background: type.color }}>
                    <type.icon size={18} />
                  </span>
                  {type.label}
                </span>
                <span className="flex-1 text-xs text-slate-600">{type.text}</span>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: type.color }}
                >
                  <Plus className="size-4" /> Iniciar
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-semibold text-[var(--pf-navy)]">Inventarios realizados</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-xs font-semibold text-slate-500">
            Tipo
            <select className="mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">Todos</option>
              {COUNT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => downloadGrid("inventarios", columns, rows)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
        </div>
      </div>
      {!data ? <p className="text-sm text-slate-500">Cargando…</p> : <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} empty="Todavía no hay inventarios de este tipo." />}
    </div>
  )
}

// ---------------------------------------------------------------- Hoja de conteo

type Entry = { qty: string; measureId: string }
type Filter = "all" | "pending" | "counted" | "diff"

export function CountSheetPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const [count, setCount] = useState<CountDetail | null>(null)
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [blindToggle, setBlind] = useState(false)
  const [scanAdds, setScanAdds] = useState(true)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState("")
  const dirty = useRef(new Set<string>())
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    const detail = await getCount(id)
    setCount(detail)
    setEntries(
      Object.fromEntries(
        detail.lines.map((line) => [line.productId, { qty: line.counted === null ? "" : String(Number(line.counted.toFixed(4))), measureId: line.measures[0]?.id ?? "" }]),
      ),
    )
  }, [id])

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [load])

  const open = count?.status === "OPEN" && count.canManage && count.sameWarehouse
  const mode = count?.mode ?? "CORRECTION"
  const blindMode = mode === "BLIND"
  const blind = blindMode || blindToggle
  const typeInfo = COUNT_TYPES.find((item) => item.id === mode) ?? COUNT_TYPES[1]

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    if (!dirty.current.size) return true
    const ids = [...dirty.current]
    dirty.current.clear()
    setSaveState("saving")
    try {
      await saveCountLines(
        id,
        ids.map((productId) => ({ productId, quantity: entriesRef.current[productId]?.qty ?? "", measureId: entriesRef.current[productId]?.measureId })),
      )
      setSaveState(dirty.current.size ? "saving" : "saved")
      return true
    } catch (err) {
      ids.forEach((item) => dirty.current.add(item))
      setSaveState("error")
      setError(err instanceof Error ? err.message : "No se pudo guardar el avance")
      return false
    }
  }, [id])

  // Guardado automático unos segundos después de dejar de escribir; y al salir de la página.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        void flush()
        event.preventDefault()
      }
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      if (dirty.current.size) void flush()
    }
  }, [flush])

  function setEntry(productId: string, patch: Partial<Entry>) {
    setEntries((current) => ({ ...current, [productId]: { ...current[productId], ...patch } }))
    dirty.current.add(productId)
    setSaveState("idle")
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 1500)
  }

  function baseCounted(line: CountLine): number | null {
    const entry = entries[line.productId]
    if (!entry) return null
    const value = parseQty(entry.qty)
    if (value === null) return null
    const factor = line.measures.find((item) => item.id === entry.measureId)?.factor ?? 1
    return value * factor
  }

  const categories = useMemo(() => [...new Set(count?.lines.map((line) => line.category) ?? [])].sort((a, b) => a.localeCompare(b, "es")), [count])

  const stats = useMemo(() => {
    let counted = 0
    let diff = 0
    let shortage = 0
    let surplus = 0
    for (const line of count?.lines ?? []) {
      const value = baseCounted(line)
      if (value === null) continue
      counted += 1
      const delta = Number((value - line.system).toFixed(4))
      if (delta === 0) continue
      diff += 1
      const cost = delta * line.costPerUnit
      if (delta < 0) shortage += -cost
      else surplus += cost
    }
    return { counted, diff, shortage, surplus, total: count?.lines.length ?? 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, entries])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (count?.lines ?? []).filter((line) => {
      if (category && line.category !== category) return false
      if (term && !`${line.name} ${line.code} ${line.barcodes.join(" ")}`.toLowerCase().includes(term)) return false
      if (count?.status !== "OPEN") {
        if (filter === "diff") return line.counted !== null && line.diffLabel !== "0"
        if (filter === "pending") return line.counted === null
        if (filter === "counted") return line.counted !== null
        return true
      }
      const value = baseCounted(line)
      if (filter === "pending") return value === null
      if (filter === "counted") return value !== null
      if (filter === "diff") return value !== null && Number((value - line.system).toFixed(4)) !== 0
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, entries, search, category, filter])

  function focusRow(productId: string) {
    const input = inputs.current.get(productId)
    if (!input) return
    input.scrollIntoView({ block: "center", behavior: "smooth" })
    input.focus()
    input.select()
    setFlash(productId)
    window.setTimeout(() => setFlash(""), 1200)
  }

  function onScan(code: string) {
    const term = code.trim().toLowerCase()
    const line = count?.lines.find((item) => item.barcodes.some((barcode) => barcode.toLowerCase() === term) || item.code.toLowerCase() === term)
    if (!line) {
      setSearch(code)
      setNotice(`Sin código exacto “${code}”: se filtró la lista.`)
      return
    }
    setNotice("")
    setSearch("")
    setFilter("all")
    setCategory("")
    if (scanAdds && open) {
      const current = parseQty(entries[line.productId]?.qty ?? "") ?? 0
      setEntry(line.productId, { qty: String(Number((current + 1).toFixed(4))) })
      playScanPit()
    }
    window.setTimeout(() => focusRow(line.productId), 50)
  }

  function nextInput(productId: string) {
    const index = visible.findIndex((line) => line.productId === productId)
    const next = visible[index + 1]
    if (next) focusRow(next.productId)
  }

  function matchSystem(line: CountLine) {
    setEntry(line.productId, { qty: String(Number(line.system.toFixed(4))), measureId: line.measures[0]?.id ?? "" })
  }

  function pendingAsSystem() {
    const pending = visible.filter((line) => baseCounted(line) === null)
    if (!pending.length) return
    if (!window.confirm(`Se pondrá la cantidad del sistema en ${pending.length} producto(s) sin contar de la lista visible. ¿Continuar?`)) return
    for (const line of pending) matchSystem(line)
  }

  async function onClose(uncounted: "KEEP" | "ZERO") {
    setBusy(true)
    setError("")
    try {
      if (!(await flush())) return
      await closeCount(id, uncounted)
      setClosing(false)
      await load()
      setFilter("diff")
      setNotice(
        mode === "CORRECTION"
          ? "Corrección guardada. El stock quedó ajustado y el resumen está en Inventario → Informes de inventario."
          : "Informe generado. El stock no se modificó. Lo ves aquí y en Inventario → Informes de inventario.",
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el cuadre")
    } finally {
      setBusy(false)
    }
  }

  async function onCancel() {
    if (!window.confirm("¿Anular este conteo? No se cambiará ningún stock.")) return
    try {
      await cancelCount(id)
      navigate("/inventario/conteo")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular")
    }
  }

  if (!count) {
    return <div className="p-4 text-sm text-slate-500">{error || "Cargando conteo…"}</div>
  }

  const currency = count.currency
  const closed = count.status === "CLOSED"
  const net = stats.surplus - stats.shortage
  const progress = stats.total ? Math.round((stats.counted / stats.total) * 100) : 0
  const chips: { id: Filter; label: string; n: number }[] = closed
    ? [
        { id: "diff", label: "Con diferencia", n: count.lines.filter((line) => line.counted !== null && line.diffLabel !== "0").length },
        { id: "counted", label: "Contados", n: count.lines.filter((line) => line.counted !== null).length },
        { id: "all", label: "Todos", n: count.lines.length },
      ]
    : [
        { id: "all", label: "Todos", n: stats.total },
        { id: "pending", label: "Pendientes", n: stats.total - stats.counted },
        { id: "counted", label: "Contados", n: stats.counted },
        { id: "diff", label: "Con diferencia", n: stats.diff },
      ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/inventario/conteo" className="text-xs font-semibold text-[var(--pf-accent)]">
            ← Toma de inventario
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">
            {count.modeLabel ?? "Inventario"} N.º {count.number}{" "}
            <span
              className={`align-middle rounded-full px-2 py-0.5 text-xs font-semibold ${
                count.status === "OPEN" ? "bg-amber-50 text-amber-800" : closed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {count.statusLabel}
            </span>
          </h1>
          <p className="text-sm text-slate-500">
            {count.warehouseName} · {count.scope} · {count.userName} · {count.closedAtLabel || count.createdAtLabel}
            {count.note ? ` · ${count.note}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a href={`/api/inventory/counts/${count.id}/csv`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <Download className="size-4" /> Excel
          </a>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <Printer className="size-4" /> {closed ? "Imprimir cuadre" : "Hoja de conteo"}
          </button>
          {closed ? (
            <Link to={`/inventario/informes?grupo=${typeInfo.report}`} className="inline-flex h-10 items-center rounded-xl bg-[var(--pf-accent)] px-3 text-sm font-semibold text-white">
              Ver en informes
            </Link>
          ) : null}
        </div>
      </div>

      {count.status === "OPEN" && !count.sameWarehouse ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Este conteo es de {count.warehouseName}. Cambia tu lugar de trabajo a ese almacén para continuarlo.</p>
      ) : null}
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">{notice}</p> : null}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Contados" value={closed ? `${count.summary.countedItems}` : `${stats.counted} / ${stats.total}`} color="#0ea5e9">
          {!closed ? (
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sky-100">
              <span className="block h-full rounded-full bg-sky-500" style={{ width: `${progress}%` }} />
            </span>
          ) : (
            <span className="text-xs text-slate-500">{count.summary.diffItems} con diferencia</span>
          )}
        </Stat>
        <Stat label="Faltante (costo)" value={closed ? count.summary.shortage : blind ? "•••" : money(stats.shortage, currency)} color={RED} />
        <Stat label="Sobrante (costo)" value={closed ? count.summary.surplus : blind ? "•••" : money(stats.surplus, currency)} color={BLUE} />
        <Stat
          label="Diferencia neta"
          value={closed ? count.summary.net : blind ? "•••" : money(net, currency)}
          color={closed ? (count.summary.net.includes("-") ? RED : GREEN) : net < 0 ? RED : net > 0 ? BLUE : GREEN}
        />
      </div>

      {/* Herramientas */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm print:hidden">
        {open ? (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <CodeField onCode={onScan} placeholder="Escanea o escribe el código y Enter (suma 1 y te lleva al producto)" />
            </div>
            <ScannerButton onCode={onScan} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm sm:max-w-xs"
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-sm">
            <option value="">Todas las marcas</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={`h-9 rounded-full px-3 text-xs font-semibold ${filter === chip.id ? "bg-[var(--pf-navy)] text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {chip.label} <span className="opacity-70">{chip.n}</span>
              </button>
            ))}
          </div>
        </div>
        {open ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={scanAdds} onChange={(e) => setScanAdds(e.target.checked)} className="size-4" />
              Cada lectura suma 1
            </label>
            {blindMode ? (
              <span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">Inventario ciego: el stock del sistema se ve al terminar</span>
            ) : (
              <>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={blindToggle} onChange={(e) => setBlind(e.target.checked)} className="size-4" />
                  Ocultar stock del sistema
                </label>
                <button type="button" onClick={pendingAsSystem} className="rounded-lg px-2 py-1 font-semibold text-[var(--pf-accent)] hover:bg-slate-100">
                  Pendientes = sistema
                </button>
              </>
            )}
            <span className="ml-auto text-xs text-slate-500">
              {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "✓ Avance guardado" : saveState === "error" ? "⚠ Sin guardar" : dirty.current.size ? "Cambios sin guardar" : ""}
            </span>
          </div>
        ) : null}
      </div>

      {/* Lista */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[minmax(0,1fr)_7rem_15rem_9rem] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <span>Producto</span>
          <span className="text-right">Sistema</span>
          <span>{closed ? "Contado" : "Cantidad contada"}</span>
          <span className="text-right">Diferencia</span>
        </div>
        {visible.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">Nada que mostrar con este filtro.</p> : null}
        <ul className="divide-y divide-slate-100">
          {visible.map((line) => {
            const entry = entries[line.productId] ?? { qty: "", measureId: "" }
            const value = closed ? line.counted : baseCounted(line)
            const delta = value === null ? null : Number((value - line.system).toFixed(4))
            const deltaCost = closed ? line.diffValueCents / 100 : delta === null ? 0 : delta * line.costPerUnit
            const tone = delta === null ? "#94a3b8" : delta === 0 ? GREEN : delta < 0 ? RED : BLUE
            return (
              <li
                key={line.productId}
                className={`grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_7rem_15rem_9rem] md:items-center md:gap-3 ${flash === line.productId ? "bg-amber-50" : ""}`}
                style={{ boxShadow: delta !== null ? `inset 3px 0 0 ${tone}` : undefined }}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--pf-navy)]">{line.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {line.code} · {line.category}
                    {line.trackLots ? " · con lotes" : ""}
                  </p>
                </div>
                <p className="text-sm tabular-nums text-slate-600 md:text-right">
                  <span className="text-xs text-slate-400 md:hidden">Sistema: </span>
                  {blind && !closed ? "•••" : `${qty(line.system)} ${line.unit}`}
                </p>
                {open ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={(element) => {
                        if (element) inputs.current.set(line.productId, element)
                        else inputs.current.delete(line.productId)
                      }}
                      inputMode="decimal"
                      aria-label={`Cantidad contada de ${line.name}`}
                      value={entry.qty}
                      placeholder="—"
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => setEntry(line.productId, { qty: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          nextInput(line.productId)
                        }
                      }}
                      className="h-10 w-24 rounded-xl border border-slate-200 px-2 text-right font-semibold tabular-nums"
                    />
                    {line.measures.length > 1 ? (
                      <select
                        aria-label="Unidad"
                        value={entry.measureId}
                        onChange={(event) => setEntry(line.productId, { measureId: event.target.value })}
                        className="h-10 w-20 rounded-xl border border-slate-200 px-1 text-xs"
                      >
                        {line.measures.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {item.factor !== 1 ? ` (${qty(item.factor)} ${line.unit})` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="w-8 text-xs text-slate-500">{line.unit}</span>
                    )}
                    {!blind ? (
                      <button
                        type="button"
                        title="Igual al sistema"
                        onClick={() => matchSystem(line)}
                        className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      >
                        <Equal className="size-4" />
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm font-semibold tabular-nums">{line.counted === null ? <span className="text-slate-400">Sin contar</span> : `${qty(line.counted)} ${line.unit}`}</p>
                )}
                <p className="text-sm tabular-nums md:text-right" style={{ color: tone }}>
                  {delta === null || (blind && !closed) ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <>
                      <span className="font-bold">
                        {delta > 0 ? "+" : ""}
                        {qty(delta)} {line.unit}
                      </span>
                      {delta !== 0 ? <span className="block text-xs">{money(deltaCost, currency)}</span> : <span className="block text-xs">Cuadra</span>}
                    </>
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Acciones */}
      {open ? (
        <div className="sticky bottom-2 z-30 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur print:hidden">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => void onCancel()} className="mr-auto h-11 rounded-xl px-3 text-sm font-semibold text-red-600 hover:bg-red-50">
              Anular
            </button>
            <button
              type="button"
              onClick={() => void flush()}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
            >
              <Save className="size-4" /> Guardar avance
            </button>
            <button
              type="button"
              onClick={() => setClosing(true)}
              disabled={stats.counted === 0}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <ClipboardCheck className="size-4" /> {mode === "CORRECTION" ? "Guardar corrección" : "Terminar y generar informe"}
            </button>
          </div>
        </div>
      ) : null}

      {closing ? (
        <CloseDialog
          mode={mode}
          hideValues={blindMode}
          stats={stats}
          currency={currency}
          busy={busy}
          onCancel={() => setClosing(false)}
          onConfirm={(uncounted) => void onClose(uncounted)}
        />
      ) : null}
    </div>
  )
}

function Stat({ label, value, color, children }: { label: string; value: string; color: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" style={{ borderTop: `3px solid ${color}` }}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
      {children}
    </div>
  )
}

function CloseDialog({
  mode,
  hideValues,
  stats,
  currency,
  busy,
  onCancel,
  onConfirm,
}: {
  mode: string
  hideValues: boolean
  stats: { counted: number; diff: number; shortage: number; surplus: number; total: number }
  currency: string
  busy: boolean
  onCancel: () => void
  onConfirm: (uncounted: "KEEP" | "ZERO") => void
}) {
  const [uncounted, setUncounted] = useState<"KEEP" | "ZERO">("KEEP")
  const pending = stats.total - stats.counted
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--pf-navy)]/50 p-3" role="dialog" aria-modal="true" aria-label="Guardar cuadre">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-[var(--pf-navy)]">{mode === "CORRECTION" ? "Guardar corrección" : "Terminar inventario"}</h2>
        <ul className="space-y-1 text-sm">
          <li>
            Contados: <b>{stats.counted}</b> de {stats.total}
            {hideValues ? null : (
              <>
                {" "}· con diferencia: <b>{stats.diff}</b>
              </>
            )}
          </li>
          {hideValues ? <li className="text-slate-500">Las diferencias se muestran al generar el informe.</li> : null}
          <li style={{ color: RED }} className={hideValues ? "hidden" : ""}>
            Faltante: <b>{money(stats.shortage, currency)}</b>
          </li>
          <li style={{ color: BLUE }} className={hideValues ? "hidden" : ""}>
            Sobrante: <b>{money(stats.surplus, currency)}</b>
          </li>
        </ul>
        {pending > 0 ? (
          <fieldset className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
            <legend className="px-1 font-semibold text-slate-700">{pending} producto(s) sin contar</legend>
            <label className="flex items-start gap-2">
              <input type="radio" checked={uncounted === "KEEP"} onChange={() => setUncounted("KEEP")} className="mt-1" />
              <span>Dejar su stock como está (no se tocan)</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" checked={uncounted === "ZERO"} onChange={() => setUncounted("ZERO")} className="mt-1" />
              <span>Ponerlos en 0 (no hay en el almacén)</span>
            </label>
          </fieldset>
        ) : null}
        <p className="text-xs text-slate-500">
          {mode === "CORRECTION"
            ? "Se compara con el stock del sistema en este momento, se corrige el stock con ajustes en el kardex y el resumen queda en Informes de inventario. No se puede deshacer."
            : "Se compara con el stock del sistema en este momento y se genera el informe. El stock NO se modifica."}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">
            Volver
          </button>
          <button type="button" onClick={() => onConfirm(uncounted)} disabled={busy} className="h-11 flex-1 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Guardando…" : mode === "CORRECTION" ? "Confirmar corrección" : "Generar informe"}
          </button>
        </div>
      </div>
    </div>
  )
}
