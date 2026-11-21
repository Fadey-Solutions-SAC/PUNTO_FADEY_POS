import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { Check, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react"
import { ProductPhoto } from "../components/ProductPhoto"
import { createTaxonomy, getCatalog, setCatalogProductActive } from "../api"
import { CatalogImport } from "../components/CatalogImport"
import { TaxonomyPage } from "./TaxonomyPage"

type Data = Awaited<ReturnType<typeof getCatalog>>

/**
 * Productos y marcas: a la izquierda las marcas (filtro, nueva marca, cantidad de productos);
 * a la derecha «Nuevo producto», el filtro, «Ver anulados» y la tabla.
 */
export function CatalogPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [brandQuery, setBrandQuery] = useState("")
  const [brandId, setBrandId] = useState("")
  const [showVoided, setShowVoided] = useState(false)
  const [importing, setImporting] = useState(false)
  const [managing, setManaging] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newBrand, setNewBrand] = useState("")
  const [notice, setNotice] = useState("")
  const [busyId, setBusyId] = useState("")

  async function reload() {
    setData(await getCatalog())
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  const visibleProducts = useMemo(() => (data?.products ?? []).filter((product) => (showVoided ? !product.active : product.active)), [data, showVoided])

  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const product of visibleProducts) {
      const key = product.brandId || "__none"
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [visibleProducts])

  const brands = useMemo(() => {
    const term = brandQuery.trim().toLowerCase()
    return (data?.brands ?? []).filter((brand) => !term || brand.name.toLowerCase().includes(term))
  }, [data, brandQuery])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visibleProducts.filter((product) => {
      if (brandId === "__none" && product.brandId) return false
      if (brandId && brandId !== "__none" && product.brandId !== brandId) return false
      if (!q) return true
      return (
        product.name.toLowerCase().includes(q) ||
        (product.code ?? "").toLowerCase().includes(q) ||
        (product.brandName ?? "").toLowerCase().includes(q)
      )
    })
  }, [brandId, visibleProducts, query])

  async function onAddBrand(event: FormEvent) {
    event.preventDefault()
    const name = newBrand.trim()
    if (!name) return
    setError("")
    try {
      await createTaxonomy("brands", name)
      setNewBrand("")
      setAdding(false)
      setNotice(`Marca ${name} creada`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la marca")
    }
  }

  async function onActive(product: Data["products"][number], active: boolean) {
    if (!active && !window.confirm(`¿Eliminar ${product.name}? Queda anulado (no se borra su historial) y puedes restaurarlo desde «Ver anulados».`)) return
    setBusyId(product.id)
    setError("")
    try {
      await setCatalogProductActive(product.id, active)
      setNotice(`${product.name}: ${active ? "restaurado" : "eliminado (anulado)"}`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar")
    } finally {
      setBusyId("")
    }
  }

  if (error && !data) return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-slate-500">Cargando catálogo…</p>

  const selectedName =
    brandId === "__none" ? "Sin marca" : brandId ? data.brands?.find((brand) => brand.id === brandId)?.name ?? "" : ""

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Marcas */}
      <aside className="space-y-2 self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-0">
        <input
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          placeholder="Filtrar marcas"
          value={brandQuery}
          onChange={(event) => setBrandQuery(event.target.value)}
        />
        {data.writable ? (
          adding ? (
            <form onSubmit={onAddBrand} className="flex gap-1.5">
              <input
                autoFocus
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm"
                placeholder="Ej. Gloria"
                value={newBrand}
                onChange={(event) => setNewBrand(event.target.value)}
              />
              <button type="submit" className="h-10 rounded-xl bg-slate-600 px-3 text-sm font-semibold text-white">
                Crear
              </button>
              <button type="button" onClick={() => setAdding(false)} className="h-10 rounded-xl px-2 text-sm text-slate-500">
                ✕
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-600 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
            >
              <Plus size={16} /> Añadir nueva marca
            </button>
          )
        ) : null}

        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-0.5">
          {brands.map((brand) => (
            <BrandButton
              key={brand.id}
              name={brand.name}
              count={brandCounts.get(brand.id) ?? 0}
              active={brandId === brand.id}
              onClick={() => setBrandId((current) => (current === brand.id ? "" : brand.id))}
            />
          ))}
          {!brandQuery.trim() ? (
            <BrandButton
              name="Sin marca"
              count={brandCounts.get("__none") ?? 0}
              active={brandId === "__none"}
              onClick={() => setBrandId((current) => (current === "__none" ? "" : "__none"))}
              muted
            />
          ) : null}
        </div>
        {data.writable ? (
          <button type="button" onClick={() => setManaging(true)} className="w-full pt-1 text-center text-xs font-semibold text-[var(--pf-accent)] hover:underline">
            Renombrar o eliminar marcas
          </button>
        ) : null}
      </aside>

      {/* Productos */}
      <div className="min-w-0 space-y-3">
        {data.writable ? (
          <Link
            to="/productos/nuevo"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-600 text-base font-semibold text-white shadow-sm hover:bg-slate-700"
          >
            <Plus size={20} /> Nuevo producto
          </Link>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-11 min-w-[14rem] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
            <Search size={16} className="text-slate-400" />
            <input className="h-full min-w-0 flex-1 text-sm outline-none" placeholder="Filtrar producto" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            Ver anulados
            <button
              type="button"
              role="switch"
              aria-checked={showVoided}
              onClick={() => setShowVoided((value) => !value)}
              className={`relative h-5 w-9 rounded-full transition ${showVoided ? "bg-[var(--pf-accent)]" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${showVoided ? "left-[1.1rem]" : "left-0.5"}`} />
            </button>
          </label>
          <a href="/api/catalog/export" className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[var(--pf-navy)] shadow-sm">
            Exportar CSV
          </a>
          {data.writable ? (
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[var(--pf-navy)] shadow-sm"
            >
              Importar CSV
            </button>
          ) : null}
        </div>

        <p className="text-sm text-slate-500">
          Mostrando {selectedName ? <b className="text-slate-700">{selectedName}</b> : "sin marca seleccionada"} · {filtered.length} producto
          {filtered.length === 1 ? "" : "s"}
          {showVoided ? " anulados" : ""}
        </p>

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {notice}</p> : null}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-3 font-semibold">Producto</th>
                <th className="px-3 py-3 font-semibold">Cód.</th>
                <th className="px-3 py-3 font-semibold">Marca</th>
                <th className="px-3 py-3 text-right font-semibold">Precio venta</th>
                <th className="px-3 py-3 text-right font-semibold">Precio compra</th>
                <th className="px-3 py-3 text-center font-semibold">Stock</th>
                <th className="px-3 py-3 text-center font-semibold">¿Activo?</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((product) => {
                const stock = product.stockValue ?? Number.parseFloat(String(product.stock))
                const low = stock <= 0 ? "bg-red-50 text-red-700" : product.minStock && stock <= product.minStock ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
                return (
                  <tr key={product.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-3">
                        <ProductPhoto
                          name={product.name}
                          imagePath={product.imagePath}
                          productId={product.id}
                          categoryId={product.brandId}
                          size={36}
                          editable={data.writable}
                        />
                        <span className="font-medium text-[var(--pf-navy)]">{product.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{product.code || "—"}</td>
                    <td className="px-3 py-2.5">
                      {product.brandName ? (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">{product.brandName}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{product.price}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{product.cost || "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${low}`}>{product.stock}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {product.active ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <Check size={14} /> Sí
                        </span>
                      ) : (
                        <span className="text-slate-400">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {data.writable ? (
                        <span className="flex justify-end gap-1.5 whitespace-nowrap">
                          <Link
                            to={`/productos/${product.id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            <Pencil size={13} /> Editar
                          </Link>
                          {product.active ? (
                            <button
                              type="button"
                              disabled={busyId === product.id}
                              onClick={() => void onActive(product, false)}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                            >
                              <Trash2 size={13} /> Eliminar
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === product.id}
                              onClick={() => void onActive(product, true)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <RotateCcw size={13} /> Restaurar
                            </button>
                          )}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-slate-500">{showVoided ? "No hay productos anulados." : "Sin coincidencias."}</p>
          ) : null}
        </div>
      </div>

      {importing ? (
        <CatalogImport
          onClose={() => setImporting(false)}
          onDone={async (text) => {
            setImporting(false)
            setNotice(text)
            await reload()
          }}
        />
      ) : null}

      {managing ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-[var(--pf-navy)]/50 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="Marcas"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setManaging(false)
              void reload()
            }
          }}
        >
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Marcas</h2>
              <button
                type="button"
                className="text-sm text-slate-500 hover:text-slate-800"
                onClick={() => {
                  setManaging(false)
                  void reload()
                }}
              >
                Cerrar
              </button>
            </div>
            <TaxonomyPage brandsOnly />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function BrandButton({ name, count, active, onClick, muted = false }: { name: string; count: number; active: boolean; onClick: () => void; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
        active ? "border-[var(--pf-accent)] bg-[var(--pf-accent)]/10 font-semibold text-[var(--pf-navy)]" : "border-slate-200 bg-slate-50 hover:bg-white"
      } ${muted && !active ? "text-slate-500" : "text-slate-800"}`}
    >
      <span className="min-w-0 uppercase">
        {name} <span className="text-xs font-normal text-slate-500">({count})</span>
      </span>
    </button>
  )
}
