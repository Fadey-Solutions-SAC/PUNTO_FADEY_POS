import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  confirmSale,
  getSaleStatus,
  searchSaleProducts,
  type SaleProduct,
} from "../api"

type CartLine = SaleProduct & { quantity: number; key: string }

export function SalesPage() {
  const [cashOpen, setCashOpen] = useState<boolean | null>(null)
  const [registerName, setRegisterName] = useState<string | null>(null)
  const [currency, setCurrency] = useState("PEN")
  const [query, setQuery] = useState("")
  const [products, setProducts] = useState<SaleProduct[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    getSaleStatus()
      .then((status) => {
        setCashOpen(status.cashOpen)
        setRegisterName(status.registerName)
        setCurrency(status.currency)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      searchSaleProducts(query)
        .then((data) => {
          setProducts(data.products)
          setCurrency(data.currency)
        })
        .catch(() => setProducts([]))
    }, 200)
    return () => window.clearTimeout(handle)
  }, [query])

  const totalCents = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
    [cart],
  )

  function addProduct(product: SaleProduct) {
    setCart((current) => {
      const key = `${product.id}:${product.presentationId}`
      const existing = current.find((line) => line.key === key)
      if (existing) {
        return current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line))
      }
      return [...current, { ...product, quantity: 1, key }]
    })
    setMessage("")
  }

  function changeQty(key: string, quantity: number) {
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, quantity } : line))
        .filter((line) => line.quantity > 0),
    )
  }

  async function onCharge() {
    if (!cart.length) return
    setPending(true)
    setError("")
    setMessage("")
    try {
      const amount = (totalCents / 100).toFixed(2)
      const result = await confirmSale({
        idempotencyKey: crypto.randomUUID(),
        lines: cart.map((line) => ({
          productId: line.id,
          presentationId: line.presentationId,
          quantity: String(line.quantity),
        })),
        payments: [{ method: "CASH", amount }],
      })
      setCart([])
      setMessage(`Venta cobrada: ${result.total}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cobrar")
    } finally {
      setPending(false)
    }
  }

  if (cashOpen === false) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
        <h1 className="text-lg font-semibold">Abre una caja primero</h1>
        <p className="text-sm">Para cobrar ventas necesitas una sesión de caja abierta.</p>
        <Link to="/caja" className="text-sm font-medium text-[var(--pf-accent)] hover:underline">
          Ir a caja
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Venta rápida</h1>
          <p className="mt-1 text-sm text-slate-500">
            {registerName ? `Caja ${registerName} · ` : ""}
            Cobro en efectivo (fase 4).
          </p>
        </div>
        <input
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          placeholder="Buscar producto o código…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {products.map((product) => (
            <button
              key={`${product.id}-${product.presentationId}`}
              type="button"
              onClick={() => addProduct(product)}
              className="rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[var(--pf-accent)]"
            >
              <p className="font-medium text-[var(--pf-navy)]">{product.name}</p>
              <p className="text-xs text-slate-500">
                {product.presentationName} · {product.code}
              </p>
              <p className="mt-1 text-sm font-semibold">{product.unitPriceLabel}</p>
            </button>
          ))}
        </div>
      </section>

      <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium text-[var(--pf-navy)]">Carrito</h2>
        {cart.length === 0 ? <p className="text-sm text-slate-500">Agrega productos.</p> : null}
        <ul className="space-y-2">
          {cart.map((line) => (
            <li key={line.key} className="flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{line.name}</p>
                <p className="text-xs text-slate-500">{line.unitPriceLabel}</p>
              </div>
              <input
                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right"
                type="number"
                min={1}
                value={line.quantity}
                onChange={(event) => changeQty(line.key, Math.max(1, Number(event.target.value) || 1))}
              />
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 pt-3">
          <p className="text-sm text-slate-500">Total</p>
          <p className="text-2xl font-semibold text-[var(--pf-navy)]">
            {(totalCents / 100).toFixed(2)} {currency}
          </p>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
        <button
          type="button"
          disabled={pending || !cart.length || cashOpen !== true}
          onClick={onCharge}
          className="h-12 w-full rounded-xl bg-[#f5c518] text-sm font-semibold text-[#1a1403] disabled:opacity-60"
        >
          {pending ? "Cobrando…" : "Cobrar en efectivo"}
        </button>
        <div className="flex gap-3 text-sm">
          <Link to="/caja" className="text-[var(--pf-accent)] hover:underline">
            Caja
          </Link>
          <Link to="/caja/cierre" className="text-[var(--pf-accent)] hover:underline">
            Cierre
          </Link>
        </div>
      </aside>
    </div>
  )
}
