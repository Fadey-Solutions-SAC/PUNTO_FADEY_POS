import { useCallback, useEffect, useState, type FormEvent } from "react"
import { createTaxonomy, deleteTaxonomy, getTaxonomy, renameTaxonomy, type TaxonomyItem } from "../api"

type Kind = "categories" | "brands"

/** Categorías y marcas del catálogo. */
export function TaxonomyPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getTaxonomy>> | null>(null)
  const [kind, setKind] = useState<Kind>("categories")
  const [name, setName] = useState("")
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      getTaxonomy()
        .then(setData)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error")),
    [],
  )

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await action()
      await load()
      setMessage(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(false)
    }
  }

  function onAdd(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      await createTaxonomy(kind, name)
      setName("")
    }, kind === "categories" ? "Categoría creada" : "Marca creada")
  }

  const items: TaxonomyItem[] = kind === "categories" ? data?.categories ?? [] : data?.brands ?? []
  const label = kind === "categories" ? "categoría" : "marca"

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Categorías y marcas</h1>
        <p className="text-sm text-slate-500">Ordenan el catálogo, los filtros de venta y los informes por categoría.</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ["categories", `Categorías (${data?.categories.length ?? 0})`],
            ["brands", `Marcas (${data?.brands.length ?? 0})`],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setKind(value)
              setEditing(null)
            }}
            className={`h-10 rounded-lg text-sm font-semibold ${kind === value ? "bg-white text-[var(--pf-navy)] shadow-sm" : "text-slate-500"}`}
          >
            {text}
          </button>
        ))}
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

      {data?.writable ? (
        <form onSubmit={onAdd} className="flex gap-2">
          <input
            required
            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
            placeholder={`Nueva ${label}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={busy} className="h-11 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60">
            Agregar
          </button>
        </form>
      ) : null}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {items.length === 0 ? <li className="px-4 py-8 text-center text-sm text-slate-500">Todavía no hay {kind === "categories" ? "categorías" : "marcas"}.</li> : null}
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            {editing?.id === item.id ? (
              <form
                className="flex min-w-0 flex-1 gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void run(async () => {
                    await renameTaxonomy(kind, item.id, editing.name)
                    setEditing(null)
                  }, "Nombre actualizado")
                }}
              >
                <input autoFocus className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm" value={editing.name} onChange={(e) => setEditing({ id: item.id, name: e.target.value })} />
                <button type="submit" disabled={busy} className="rounded-lg bg-[var(--pf-accent)] px-3 text-xs font-semibold text-white">
                  Guardar
                </button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-2 text-xs text-slate-500">
                  Cancelar
                </button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate font-medium text-[var(--pf-navy)]">{item.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {item.products} producto{item.products === 1 ? "" : "s"}
                </span>
                {data?.writable ? (
                  <>
                    <button type="button" onClick={() => setEditing({ id: item.id, name: item.name })} className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--pf-accent)] hover:bg-slate-100">
                      Renombrar
                    </button>
                    <button
                      type="button"
                      disabled={busy || item.products > 0}
                      title={item.products > 0 ? "Tiene productos: cámbialos de categoría antes de eliminarla" : undefined}
                      onClick={() => {
                        if (window.confirm(`¿Eliminar ${item.name}?`)) void run(() => deleteTaxonomy(kind, item.id), "Eliminada")
                      }}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent"
                    >
                      Eliminar
                    </button>
                  </>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
