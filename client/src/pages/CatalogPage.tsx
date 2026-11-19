import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { getCatalog } from "../api"

export function CatalogPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCatalog>> | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [categoryId, setCategoryId] = useState("")

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
      if (categoryId && product.categoryId !== categoryId) return false
      if (!q) return true
      return (
        product.name.toLowerCase().includes(q) ||
        (product.code ?? "").toLowerCase().includes(q) ||
        (product.brandName ?? "").toLowerCase().includes(q)
      )
    })
  }, [categoryId, data, query])

  if (error && !data) {
    return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
  }
  if (!data) return <p className="text-sm text-slate-500">Cargando catálogo…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Catálogo</h1>
          <p className="mt-1 text-sm text-slate-500">
            {filtered.length} producto{filtered.length === 1 ? "" : "s"}.
          </p>
        </div>
        {data.writable ? (
          <Link
            to="/productos/nuevo"
            className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold leading-10 text-white"
          >
            Nuevo producto
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          placeholder="Buscar nombre, código o marca…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Todas las categorías</option>
          {data.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium">Categoría</th>
              <th className="px-3 py-2 font-medium">Stock</th>
              <th className="px-3 py-2 font-medium text-right">Precio</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-500">{product.code || "—"}</td>
                <td className="px-3 py-2">
                  <span className="font-medium text-[var(--pf-navy)]">{product.name}</span>
                  {product.brandName ? <span className="block text-xs text-slate-500">{product.brandName}</span> : null}
                </td>
                <td className="px-3 py-2">{product.categoryName || "—"}</td>
                <td className="px-3 py-2">{product.stock}</td>
                <td className="px-3 py-2 text-right font-medium">{product.price}</td>
                <td className="px-3 py-2">
                  <span className={product.active ? "text-emerald-700" : "text-slate-400"}>
                    {product.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {data.writable ? (
                    <Link to={`/productos/${product.id}`} className="text-[var(--pf-accent)] hover:underline">
                      Editar
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="px-3 py-6 text-center text-sm text-slate-500">Sin coincidencias.</p> : null}
      </div>
    </div>
  )
}
