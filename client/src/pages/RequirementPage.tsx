import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getPurchaseRequirement, savePurchaseRequirement } from "../api"

export function RequirementPage() {
  const [warehouseName, setWarehouseName] = useState("")
  const [products, setProducts] = useState<Awaited<ReturnType<typeof getPurchaseRequirement>>["products"]>([])
  const [qty, setQty] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    getPurchaseRequirement()
      .then((data) => {
        setWarehouseName(data.warehouseName)
        setProducts(data.products)
        setQty(Object.fromEntries(data.products.map((product) => [product.productId, product.quantity])))
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function onSave() {
    setPending(true)
    setError("")
    try {
      await savePurchaseRequirement(
        products.map((product) => ({
          productId: product.productId,
          quantity: qty[product.productId] ?? "0",
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Requerimiento</h1>
        <p className="mt-1 text-sm text-slate-500">
          Stock bajo en {warehouseName || "el almacén"}. Luego recibe en{" "}
          <Link to="/compras/recepcion" className="text-[var(--pf-accent)] hover:underline">
            Recepción
          </Link>
          .
        </p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {products.length === 0 && !error ? (
        <p className="text-sm text-slate-600">No hay productos con stock bajo en este almacén.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Mín / Máx</th>
                  <th className="px-3 py-2 font-medium">Comprar</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.productId} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {product.name}
                      <span className="block text-xs text-slate-500">{product.categoryName ?? "Sin categoría"}</span>
                    </td>
                    <td className="px-3 py-2">
                      {product.stock} {product.unit}
                    </td>
                    <td className="px-3 py-2">
                      {product.minStock} / {product.maxStock ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-24 rounded-xl border border-slate-200 px-3 py-2"
                        value={qty[product.productId] ?? ""}
                        onChange={(event) =>
                          setQty((current) => ({ ...current, [product.productId]: event.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onSave}
            className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar requerimiento"}
          </button>
        </>
      )}
    </div>
  )
}
