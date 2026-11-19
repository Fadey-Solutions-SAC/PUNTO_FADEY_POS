import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  confirmSale,
  getSaleStatus,
  searchSaleProducts,
  type SaleProduct,
} from "../api"

type CartLine = SaleProduct & { quantity: number; key: string }
type PayRow = { method: string; amount: string }

export function SalesPage() {
  const navigate = useNavigate()
  const [cashOpen, setCashOpen] = useState<boolean | null>(null)
  const [registerName, setRegisterName] = useState<string | null>(null)
  const [currency, setCurrency] = useState("PEN")
  const [methods, setMethods] = useState<{ code: string; label: string }[]>([])
  const [query, setQuery] = useState("")
  const [products, setProducts] = useState<SaleProduct[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState("0")
  const [discountMode, setDiscountMode] = useState<"money" | "percent">("money")
  const [payments, setPayments] = useState<PayRow[]>([{ method: "CASH", amount: "" }])
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    getSaleStatus()
      .then((status) => {
        setCashOpen(status.cashOpen)
        setRegisterName(status.registerName)
        setCurrency(status.currency)
        setMethods(status.methods.length ? status.methods : [{ code: "CASH", label: "Efectivo" }])
        setPayments([{ method: status.methods[0]?.code ?? "CASH", amount: "" }])
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

  const subtotalCents = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
    [cart],
  )

  const discountCents = useMemo(() => {
    const raw = Number(discount.replace(",", ".") || 0)
    if (!Number.isFinite(raw) || raw <= 0) return 0
    if (discountMode === "percent") return Math.min(subtotalCents, Math.round((subtotalCents * raw) / 100))
    return Math.min(subtotalCents, Math.round(raw * 100))
  }, [discount, discountMode, subtotalCents])

  const totalCents = Math.max(0, subtotalCents - discountCents)
  const totalAmount = (totalCents / 100).toFixed(2)

  useEffect(() => {
    setPayments((current) => {
      if (current.length === 1) return [{ ...current[0], amount: totalAmount }]
      return current
    })
  }, [totalAmount])

  function addProduct(product: SaleProduct) {
    setCart((current) => {
      const key = `${product.id}:${product.presentationId}`
      const existing = current.find((line) => line.key === key)
      if (existing) {
        return current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line))
      }
      return [...current, { ...product, quantity: 1, key }]
    })
  }

  function changeQty(key: string, quantity: number) {
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, quantity } : line))
        .filter((line) => line.quantity > 0),
    )
  }

  function updatePayment(index: number, patch: Partial<PayRow>) {
    setPayments((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function onCharge() {
    if (!cart.length) return
    setPending(true)
    setError("")
    try {
      const payRows = payments.filter((row) => Number(row.amount || 0) > 0)
      const rows = payRows.length ? payRows : [{ method: "CASH", amount: totalAmount }]
      const result = await confirmSale({
        idempotencyKey: crypto.randomUUID(),
        discount: (discountCents / 100).toFixed(2),
        lines: cart.map((line) => ({
          productId: line.id,
          presentationId: line.presentationId,
          quantity: String(line.quantity),
        })),
        payments: rows,
      })
      setCart([])
      setDiscount("0")
      navigate(`/ventas/${result.saleId}/ticket`)
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
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Venta rápida</h1>
            <p className="mt-1 text-sm text-slate-500">
              {registerName ? `Caja ${registerName} · ` : ""}
              Descuento, varios pagos y ticket.
            </p>
          </div>
          <Link to="/ventas/historial" className="text-sm font-medium text-[var(--pf-accent)] hover:underline">
            Historial
          </Link>
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

        <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-slate-100 pt-3">
          <label className="text-sm">
            Descuento
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Tipo
            <select
              className="mt-1 rounded-xl border border-slate-200 px-2 py-2"
              value={discountMode}
              onChange={(event) => setDiscountMode(event.target.value as "money" | "percent")}
            >
              <option value="money">S/</option>
              <option value="percent">%</option>
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--pf-navy)]">Pagos</p>
            <button
              type="button"
              className="text-xs font-medium text-[var(--pf-accent)]"
              onClick={() => setPayments((current) => [...current, { method: methods[0]?.code ?? "CASH", amount: "" }])}
            >
              + método
            </button>
          </div>
          {payments.map((row, index) => (
            <div key={index} className="grid grid-cols-[1.2fr_1fr_auto] gap-2">
              <select
                className="rounded-xl border border-slate-200 px-2 py-2 text-sm"
                value={row.method}
                onChange={(event) => updatePayment(index, { method: event.target.value })}
              >
                {methods.map((method) => (
                  <option key={method.code} value={method.code}>
                    {method.label}
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border border-slate-200 px-2 py-2 text-right text-sm"
                value={row.amount}
                onChange={(event) => updatePayment(index, { amount: event.target.value })}
                placeholder="0.00"
              />
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={() => setPayments((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)))}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>
              {(subtotalCents / 100).toFixed(2)} {currency}
            </span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Descuento</span>
            <span>
              -{(discountCents / 100).toFixed(2)} {currency}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-lg font-semibold text-[var(--pf-navy)]">
            <span>Total</span>
            <span>
              {totalAmount} {currency}
            </span>
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="button"
          disabled={pending || !cart.length || cashOpen !== true}
          onClick={onCharge}
          className="h-12 w-full rounded-xl bg-[#f5c518] text-sm font-semibold text-[#1a1403] disabled:opacity-60"
        >
          {pending ? "Cobrando…" : "Cobrar"}
        </button>
      </aside>
    </div>
  )
}
