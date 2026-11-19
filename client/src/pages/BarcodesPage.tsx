import { useEffect, useState, type FormEvent } from "react"
import { createCatalogBarcode, getCatalogBarcodes } from "../api"

export function BarcodesPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCatalogBarcodes>> | null>(null)
  const [error, setError] = useState("")
  const [productId, setProductId] = useState("")
  const [code, setCode] = useState("")
  const [pending, setPending] = useState(false)

  async function reload() {
    const payload = await getCatalogBarcodes()
    setData(payload)
    if (!productId && payload.products[0]) setProductId(payload.products[0].id)
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await createCatalogBarcode(productId, code)
      setCode("")
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
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Códigos de barras</h1>
        <p className="mt-1 text-sm text-slate-500">Elige el producto y registra su código.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {data?.writable ? (
        <form onSubmit={onCreate} className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4">
          <select
            className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            {data.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <input
            required
            className="min-w-[10rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Código"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <button
            type="submit"
            disabled={pending || !productId}
            className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Vincular"}
          </button>
        </form>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Producto</th>
            </tr>
          </thead>
          <tbody>
            {(data?.codes ?? []).map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono">{row.code}</td>
                <td className="px-3 py-2">{row.productName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
