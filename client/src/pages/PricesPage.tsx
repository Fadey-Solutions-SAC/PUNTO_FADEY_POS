import { useEffect, useState, type FormEvent } from "react"
import { createCatalogPriceList, getCatalogPrices, saveCatalogPriceItem } from "../api"

export function PricesPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCatalogPrices>> | null>(null)
  const [error, setError] = useState("")
  const [listName, setListName] = useState("")
  const [listId, setListId] = useState("")
  const [productId, setProductId] = useState("")
  const [price, setPrice] = useState("")
  const [pending, setPending] = useState(false)

  async function reload() {
    const payload = await getCatalogPrices()
    setData(payload)
    if (!listId && payload.lists[0]) setListId(payload.lists[0].id)
    if (!productId && payload.products[0]) setProductId(payload.products[0].id)
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function onCreateList(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await createCatalogPriceList(listName)
      setListName("")
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear")
    } finally {
      setPending(false)
    }
  }

  async function onSavePrice(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await saveCatalogPriceItem({ listId, productId, price })
      setPrice("")
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Listas de precios</h1>
        <p className="mt-1 text-sm text-slate-500">Si la lista no tiene precio, la venta usa el del producto.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {data?.canCreateList ? (
        <form onSubmit={onCreateList} className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4">
          <input
            required
            className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Nombre de la lista"
            value={listName}
            onChange={(event) => setListName(event.target.value)}
          />
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Crear lista
          </button>
        </form>
      ) : null}
      {data?.canSavePrice && data.lists.length > 0 ? (
        <form onSubmit={onSavePrice} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
          <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={listId} onChange={(e) => setListId(e.target.value)}>
            {data.lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            {data.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <input
            required
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Precio"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-xl bg-[var(--pf-navy)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Guardar precio
          </button>
        </form>
      ) : null}
      {(data?.lists ?? []).map((list) => (
        <div key={list.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-3 py-2 font-medium text-[var(--pf-navy)]">{list.name}</h2>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium text-right">Precio</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{item.productName}</td>
                  <td className="px-3 py-2 text-right">{item.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.items.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">Sin precios en esta lista.</p> : null}
        </div>
      ))}
    </div>
  )
}
