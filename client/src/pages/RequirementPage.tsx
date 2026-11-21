import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { FileSpreadsheet, Plus, Search, Trash2 } from "lucide-react"
import {
  cancelPurchaseRequirement,
  getRequirementSetup,
  getRequirementSuggestions,
  savePurchaseRequirement,
  type RequirementItem,
} from "../api"
import { DataGrid, downloadGrid, type GridColumn } from "../components/DataGrid"

type Setup = Awaited<ReturnType<typeof getRequirementSetup>>

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/**
 * Requerimiento de compra:
 * 1. Opciones: qué pedir (stock bajo / vencimiento o deterioro) y marcas.
 * 2. Lista de trabajo: sugerencias + productos agregados a mano con el buscador.
 * 3. Generar: se guarda y aparece abajo como hoja; se puede modificar o cancelar.
 */
export function RequirementPage() {
  const now = new Date()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [sources, setSources] = useState<string[]>(["stock"])
  const [brandIds, setBrandIds] = useState<string[]>([])
  const [desde, setDesde] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())))
  const [hasta, setHasta] = useState(iso(now))
  const [draft, setDraft] = useState<RequirementItem[]>([])
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    const data = await getRequirementSetup()
    setSetup(data)
  }, [])

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [load])

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  }

  async function suggest() {
    if (!sources.length) {
      setError("Elige qué quieres pedir: stock bajo, vencimiento o deterioro")
      return
    }
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const { products } = await getRequirementSuggestions({ origen: sources, marcas: brandIds, desde, hasta })
      setDraft((current) => {
        const map = new Map(current.map((item) => [item.productId, item]))
        for (const item of products) if (!map.has(item.productId)) map.set(item.productId, item)
        return [...map.values()]
      })
      setMessage(products.length ? `${products.length} producto(s) sugeridos. Revisa las cantidades.` : "No hay productos que pedir con estas opciones.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(false)
    }
  }

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term || !setup) return []
    return setup.catalog
      .filter((item) => !draft.some((row) => row.productId === item.productId))
      .filter((item) => `${item.name} ${item.code} ${item.brand} ${item.barcodes.join(" ")}`.toLowerCase().includes(term))
      .slice(0, 8)
  }, [search, setup, draft])

  function addManual(item: Setup["catalog"][number]) {
    setDraft((current) => [...current, { productId: item.productId, name: item.name, brand: item.brand, unit: item.unit, stock: item.stock, quantity: "1", reason: "Agregado a mano" }])
    setSearch("")
  }

  async function generate() {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await savePurchaseRequirement(draft.map((item) => ({ productId: item.productId, quantity: item.quantity })))
      setDraft([])
      await load()
      setMessage("Requerimiento generado. Puedes modificarlo o cancelarlo abajo, y luego recibirlo en Recepción.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar")
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!window.confirm("¿Cancelar el requerimiento generado?")) return
    setBusy(true)
    setError("")
    try {
      await cancelPurchaseRequirement()
      await load()
      setMessage("Requerimiento cancelado")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar")
    } finally {
      setBusy(false)
    }
  }

  function modify() {
    if (!setup?.current) return
    setDraft(setup.current.lines.map((line) => ({ ...line, reason: "Del requerimiento" })))
    setMessage("El requerimiento pasó a la lista de trabajo. Cambia cantidades y vuelve a generarlo.")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const draftColumns: GridColumn<RequirementItem>[] = [
    { key: "producto", label: "Producto", value: (row) => row.name, render: (row) => <b className="text-[var(--pf-navy)]">{row.name}</b>, width: 180 },
    { key: "marca", label: "Marca", value: (row) => row.brand },
    { key: "motivo", label: "Motivo", value: (row) => row.reason ?? "" },
    { key: "stock", label: "Stock", align: "right", value: (row) => `${row.stock} ${row.unit}` },
    {
      key: "pedir",
      label: "Pedir",
      align: "right",
      value: (row) => row.quantity,
      render: (row) => (
        <input
          inputMode="decimal"
          aria-label={`Cantidad de ${row.name}`}
          className="h-8 w-20 rounded border border-slate-300 px-2 text-right font-semibold"
          value={row.quantity}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft((current) => current.map((item) => (item.productId === row.productId ? { ...item, quantity: event.target.value } : item)))}
        />
      ),
    },
    {
      key: "quitar",
      label: "",
      noExport: true,
      value: () => "",
      render: (row) => (
        <button
          type="button"
          aria-label={`Eliminar ${row.name}`}
          onClick={() => setDraft((current) => current.filter((item) => item.productId !== row.productId))}
          className="grid size-8 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={15} />
        </button>
      ),
    },
  ]

  const currentColumns: GridColumn<RequirementItem>[] = [
    { key: "producto", label: "Producto", value: (row) => row.name, width: 180 },
    { key: "marca", label: "Marca", value: (row) => row.brand },
    { key: "stock", label: "Stock actual", align: "right", value: (row) => `${row.stock} ${row.unit}` },
    { key: "pedir", label: "Cantidad a pedir", align: "right", value: (row) => `${row.quantity} ${row.unit}`, render: (row) => <b>{`${row.quantity} ${row.unit}`}</b> },
  ]

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-slate-500">
          Arma lo que vas a pedir para {setup?.warehouseName ?? "el almacén"}. Luego recíbelo en{" "}
          <Link to="/compras/recepcion" className="text-[var(--pf-accent)] hover:underline">
            Recepción
          </Link>
          .
        </p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">{message}</p> : null}

      {/* 1. Opciones antes de generar */}
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--pf-navy)]">¿Qué pedir?</p>
          {(
            [
              ["stock", "Stock bajo", "Productos en o bajo su mínimo (hasta su máximo)."],
              ["mermas", "Vencimiento o deterioro", "Lo que se perdió por vencido, deteriorado o roto (Mermas)."],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex items-start gap-2 rounded-xl border border-slate-200 p-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4" checked={sources.includes(value)} onChange={() => setSources((current) => toggle(current, value))} />
              <span>
                <b>{label}</b>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
          {sources.includes("mermas") ? (
            <div className="flex gap-2">
              <label className="text-xs font-semibold text-slate-500">
                Mermas desde
                <input type="date" className="mt-1 block h-9 rounded-lg border border-slate-300 px-2 text-sm" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                hasta
                <input type="date" className="mt-1 block h-9 rounded-lg border border-slate-300 px-2 text-sm" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </label>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--pf-navy)]">Marcas {brandIds.length ? `(${brandIds.length})` : "(todas)"}</p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {(setup?.brands ?? []).map((brand) => {
              const active = brandIds.includes(brand.id)
              return (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => setBrandIds((current) => toggle(current, brand.id))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${active ? "bg-[var(--pf-accent)] text-white ring-[var(--pf-accent)]" : "bg-white text-slate-600 ring-slate-200"}`}
                >
                  {brand.name}
                </button>
              )
            })}
            {setup && setup.brands.length === 0 ? <span className="text-xs text-slate-400">No hay marcas registradas.</span> : null}
          </div>
          <button type="button" disabled={busy} onClick={() => void suggest()} className="h-10 rounded-xl bg-[var(--pf-navy)] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Buscando…" : "Ver sugerencias"}
          </button>
        </div>

        <div className="relative space-y-2">
          <p className="text-sm font-semibold text-[var(--pf-navy)]">Agregar producto a mano</p>
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-2">
            <Search size={16} className="text-slate-400" />
            <input
              className="h-10 min-w-0 flex-1 text-sm outline-none"
              placeholder="Buscar por nombre, marca o código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {matches.length ? (
            <ul className="absolute left-0 right-0 z-20 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
              {matches.map((item) => (
                <li key={item.productId}>
                  <button type="button" onClick={() => addManual(item)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <Plus size={14} className="text-[var(--pf-accent)]" />
                    <span className="min-w-0 flex-1 truncate">
                      {item.name} <span className="text-xs text-slate-400">· {item.brand}</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {item.stock} {item.unit}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {/* 2. Lista de trabajo */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-[var(--pf-navy)]">Lista para pedir ({draft.length})</h2>
          <div className="flex gap-2">
            {draft.length ? (
              <button type="button" onClick={() => setDraft([])} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600">
                Vaciar lista
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || draft.length === 0}
              onClick={() => void generate()}
              className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Generar requerimiento
            </button>
          </div>
        </div>
        <DataGrid columns={draftColumns} rows={draft} rowKey={(row) => row.productId} empty="Usa «Ver sugerencias» o el buscador para agregar productos." maxHeight="50vh" />
      </section>

      {/* 3. Requerimiento generado */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-[var(--pf-navy)]">Requerimiento generado</h2>
            {setup?.current ? (
              <p className="text-xs text-slate-500">
                {setup.current.createdAtLabel} · {setup.current.userName} · {setup.current.lines.length} producto(s)
              </p>
            ) : null}
          </div>
          {setup?.current ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadGrid("requerimiento", currentColumns, setup.current!.lines)}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"
              >
                <FileSpreadsheet size={16} /> Excel
              </button>
              <button type="button" disabled={busy} onClick={modify} className="h-10 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-[var(--pf-navy)]">
                Modificar
              </button>
              <button type="button" disabled={busy} onClick={() => void cancel()} className="h-10 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-600 hover:bg-red-50">
                Cancelar
              </button>
            </div>
          ) : null}
        </div>
        <DataGrid
          columns={currentColumns}
          rows={setup?.current?.lines ?? []}
          rowKey={(row) => row.productId}
          empty="Todavía no hay un requerimiento generado."
          maxHeight="50vh"
        />
      </section>
    </div>
  )
}
