import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ProductPhoto } from "../components/ProductPhoto"
import { getCatalog } from "../api"
import { CatalogImport } from "../components/CatalogImport"
import { TaxonomyPage } from "./TaxonomyPage"

export function CatalogPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCatalog>> | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState("")
  const [brandId, setBrandId] = useState("")
  const [tab, setTab] = useState<"productos" | "marcas">("productos")

  useEffect(() => {
    let cancelled = false
    getCatalog()
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.products.filter((product) => {
      if (brandId === "__none" && product.brandId) return false
      if (brandId && brandId !== "__none" && product.brandId !== brandId) return false
      if (!q) return true
      return (
        product.name.toLowerCase().includes(q) ||
        (product.code ?? "").toLowerCase().includes(q) ||
        (product.brandName ?? "").toLowerCase().includes(q)
      )
    })
  }, [brandId, data, query])

  if (error && !data) {
    return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
  }
  if (!data) return <p className="text-sm text-slate-500">Cargando catálogo…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Productos y marcas</h1>
          <p className="mt-1 text-sm text-slate-500">
            {filtered.length} producto{filtered.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/catalog/export" className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[var(--pf-navy)] shadow-sm">
            Exportar CSV
          </a>
          {data.writable ? (
            <>
              <button
                type="button"
                onClick={() => setImporting(true)}
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[var(--pf-navy)] shadow-sm"
              >
                Importar CSV
              </button>
              <Link to="/productos/nuevo" className="inline-flex h-10 items-center rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white">
                Nuevo producto
              </Link>
            </>
          ) : null}
        </div>
      </div>
      <div className="grid max-w-md grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ["productos", `Productos (${data.products.length})`],
            ["marcas", `Marcas (${data.brands?.length ?? 0})`],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`h-10 rounded-lg text-sm font-semibold ${tab === value ? "bg-white text-[var(--pf-navy)] shadow-sm" : "text-slate-500"}`}
          >
            {text}
          </button>
        ))}
      </div>

      {notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {notice}</p> : null}

      {tab === "marcas" ? (
        <TaxonomyPage brandsOnly />
      ) : (
      <>
      {importing ? (
        <CatalogImport
          onClose={() => setImporting(false)}
          onDone={async (text) => {
            setImporting(false)
            setNotice(text)
            setData(await getCatalog())
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          className="h-11 min-w-[12rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm"
          placeholder="Buscar nombre, código o marca…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Filtrar por marca"
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm"
          value={brandId}
          onChange={(event) => setBrandId(event.target.value)}
        >
          <option value="">Todas las marcas</option>
          {(data.brands ?? []).map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
          <option value="__none">Sin marca</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium">Marca</th>
              <th className="px-3 py-2 font-medium">Stock</th>
              <th className="px-3 py-2 font-medium text-right">Precio</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{product.code || "—"}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-3">
                    <ProductPhoto
                      name={product.name}
                      imagePath={product.imagePath}
                      productId={product.id}
                      categoryId={product.brandId}
                      size={40}
                      editable={data.writable}
                    />
                    <span className="font-medium text-[var(--pf-navy)]">{product.name}</span>
                  </span>
                </td>
                <td className="px-3 py-2">{product.brandName || "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${
                      Number.parseFloat(String(product.stock)) > 0 ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {Number.parseFloat(String(product.stock)) > 0 ? product.stock : `Agotado · ${product.stock}`}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium">{product.price}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      product.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${product.active ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {product.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {data.writable ? (
                    <Link
                      to={`/productos/${product.id}`}
                      className="rounded-lg px-2 py-1 font-medium text-[var(--pf-accent)] hover:bg-[var(--pf-accent)]/10"
                    >
                      Editar
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="px-3 py-10 text-center text-sm text-slate-500">Sin coincidencias para la búsqueda.</p> : null}
      </div>
      </>
      )}
    </div>
  )
}
