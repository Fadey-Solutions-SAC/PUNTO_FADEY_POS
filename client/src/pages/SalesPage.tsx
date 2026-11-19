import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  confirmSale,
  getSaleStatus,
  lookupSaleProduct,
  searchSaleProducts,
  type SaleProduct,
} from "../api"
import { CodeField, playScanPit, ScannerButton } from "../components/Scanner"

type CartLine = SaleProduct & { quantity: number; key: string }
type PayRow = { method: string; amount: string }

export function SalesPage() {
  const navigate = useNavigate()
  const [cashOpen, setCashOpen] = useState<boolean | null>(null)
  const [registerName, setRegisterName] = useState<string | null>(null)
  const [openedAtLabel, setOpenedAtLabel] = useState<string | null>(null)
  const [openingLabel, setOpeningLabel] = useState<string | null>(null)
  const [currency, setCurrency] = useState("PEN")
  const [methods, setMethods] = useState<{ code: string; label: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [accesses, setAccesses] = useState<{ href: string; label: string }[]>([])
  const [hardwareReader, setHardwareReader] = useState(false)
  const [canSell, setCanSell] = useState(true)
  const [query, setQuery] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [products, setProducts] = useState<SaleProduct[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [discount, setDiscount] = useState("0")
  const [discountMode, setDiscountMode] = useState<"money" | "percent">("money")
  const [payments, setPayments] = useState<PayRow[]>([{ method: "CASH", amount: "" }])
  const [paying, setPaying] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    getSaleStatus()
      .then((status) => {
        setCashOpen(status.cashOpen)
        setRegisterName(status.registerName)
        setOpenedAtLabel(status.openedAtLabel)
        setOpeningLabel(status.openingLabel)
        setCurrency(status.currency)
        setHardwareReader(status.hardwareReader)
        setCanSell(status.canSell)
        setCategories(status.categories)
        setAccesses(status.accesses)
        setMethods(status.methods.length ? status.methods : [{ code: "CASH", label: "Efectivo" }])
        setPayments([{ method: status.methods[0]?.code ?? "CASH", amount: "" }])
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  useEffect(() => {
    if (!canSell) return
    const handle = window.setTimeout(() => {
      searchSaleProducts(query, categoryId || undefined)
        .then((data) => {
          setProducts(data.products)
          setCurrency(data.currency)
        })
        .catch(() => setProducts([]))
    }, 180)
    return () => window.clearTimeout(handle)
  }, [query, categoryId, canSell])

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
  const cartUnits = cart.reduce((sum, line) => sum + line.quantity, 0)

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
    setCartOpen(true)
    setMessage("")
  }

  async function onCode(code: string) {
    setMessage("")
    try {
      const data = await lookupSaleProduct(code)
      if (!data.product) {
        setMessage("Código no registrado")
        return
      }
      playScanPit()
      addProduct(data.product)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo leer el código")
    }
  }

  function commitSearch(raw?: string) {
    const text = (raw ?? query).trim()
    if (!text) return
    if (/^\d{6,}$/.test(text) || text.length >= 4) {
      void onCode(text).then(() => setQuery(""))
      return
    }
    if (products.length === 1) {
      addProduct(products[0])
      setQuery("")
    }
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
      setPaying(false)
      navigate(`/ventas/${result.saleId}/ticket`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cobrar")
    } finally {
      setPending(false)
    }
  }

  if (cashOpen === false) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h1 className="text-lg font-semibold">Abre una caja primero</h1>
          <p className="text-sm">La caja está cerrada. Ábrela para vender y cobrar el día.</p>
          <Link to="/caja" className="inline-flex h-11 items-center rounded-xl bg-[#f5c518] px-4 text-sm font-semibold text-[#1a1403]">
            Ir a caja
          </Link>
        </div>
        {accesses.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-[var(--pf-navy)]">Accesos de caja</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {accesses.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-medium text-[var(--pf-navy)]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    )
  }

  if (!canSell) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">No tienes permiso de venta.</p>
        {accesses.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {accesses.map((item) => (
              <Link key={item.href} to={item.href} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-sm font-medium">
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-6">
      <p className="text-sm text-slate-500">
        {registerName ? `${registerName} abierta` : "Caja abierta"}
        {openedAtLabel ? ` · ${openedAtLabel}` : ""}
        {openingLabel ? ` · efectivo inicial ${openingLabel}` : ""}
      </p>

      <div className="flex gap-2">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm">
          <span className="shrink-0 text-slate-400">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitSearch(event.currentTarget.value)
              }
            }}
            placeholder="Buscar producto…"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <ScannerButton onCode={onCode} />
      </div>
      {hardwareReader ? <CodeField onCode={onCode} autoFocus placeholder="Lector USB o Bluetooth" /> : null}
      {message ? <p className="text-sm text-amber-700">{message}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-[var(--pf-accent)]/20 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setCartOpen((open) => !open)}
          className="flex w-full items-center gap-3 bg-[var(--pf-accent)] px-4 py-3 text-left text-white"
          aria-expanded={cartOpen}
        >
          <span className="flex-1 font-semibold">Carrito de compras</span>
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">
            {cartUnits} producto{cartUnits === 1 ? "" : "s"}
          </span>
          <span className={`transition ${cartOpen ? "rotate-180" : ""}`}>▾</span>
        </button>
        {cartOpen ? (
          <div className="space-y-3 p-4">
            {cart.length === 0 ? <p className="text-sm text-slate-500">Sin productos</p> : null}
            {cart.map((line) => (
              <div key={line.key}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--pf-navy)]">
                    {line.name} · {line.presentationName}
                  </p>
                  <button
                    type="button"
                    className="text-xs text-red-700"
                    onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}
                  >
                    Quitar
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) => changeQty(line.key, Math.max(1, Number(event.target.value) || 1))}
                    className="h-9 w-20 rounded-xl border border-slate-200 px-2 text-sm"
                  />
                  <span className="text-sm text-slate-500">{line.unitPriceLabel}</span>
                  <span className="ml-auto text-sm font-medium">
                    {((line.unitPriceCents * line.quantity) / 100).toFixed(2)} {currency}
                  </span>
                </div>
              </div>
            ))}
            <div className="space-y-2 border-t pt-3 text-sm">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <label className="block">
                  Descuento
                  <input
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                  />
                </label>
                <label className="block">
                  Tipo
                  <select
                    className="mt-1 h-10 rounded-xl border border-slate-200 px-2"
                    value={discountMode}
                    onChange={(event) => setDiscountMode(event.target.value as "money" | "percent")}
                  >
                    <option value="money">S/</option>
                    <option value="percent">%</option>
                  </select>
                </label>
              </div>
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
              <div className="flex justify-between text-lg font-semibold text-[var(--pf-navy)]">
                <span>Total</span>
                <span>
                  {totalAmount} {currency}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || cart.length === 0 || cashOpen !== true}
                onClick={() => {
                  setError("")
                  setPaying(true)
                  setPayments([{ method: methods[0]?.code ?? "CASH", amount: totalAmount }])
                }}
                className="h-12 flex-1 rounded-xl bg-[#f5c518] text-sm font-semibold text-[#1a1403] disabled:opacity-60"
              >
                Cobrar
              </button>
              <Link
                to="/ventas/historial"
                className="inline-flex h-12 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-[var(--pf-navy)]"
              >
                Historial
              </Link>
            </div>
            {error && !paying ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          </div>
        ) : null}
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Productos</h2>
          <p className="text-xs text-slate-500">Catálogo disponible</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryId("")}
            className={`rounded-full px-3 py-1.5 text-sm shadow-sm ${categoryId === "" ? "bg-[var(--pf-accent)] text-white" : "bg-white text-slate-700"}`}
          >
            Todos
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm shadow-sm ${
                categoryId === category.id ? "bg-[var(--pf-accent)] text-white" : "bg-white text-slate-700"
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {products.map((product) => (
            <div
              key={`${product.id}-${product.presentationId}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-[var(--pf-navy)]">{product.name}</p>
                <p className="text-sm font-semibold text-[var(--pf-accent)]">{product.unitPriceLabel}</p>
                <p className="text-xs text-slate-500">
                  {product.presentationName}
                  {product.unit ? ` · ${product.unit}` : ""} · {product.code}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Agregar ${product.name}`}
                onClick={() => addProduct(product)}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--pf-accent)] text-lg font-bold text-white shadow-sm"
              >
                +
              </button>
            </div>
          ))}
          {products.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">Sin productos para mostrar.</p> : null}
        </div>
      </section>

      {accesses.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--pf-navy)]">Accesos de caja</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {accesses.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="rounded-2xl border border-slate-100 bg-slate-50 px-2 py-3 text-center text-xs font-medium text-[var(--pf-navy)] transition hover:border-[var(--pf-accent)]/30 hover:bg-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {paying ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--pf-navy)]/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cobro"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setPaying(false)
          }}
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Cobrar</h2>
              <button type="button" className="text-sm text-slate-500" disabled={pending} onClick={() => setPaying(false)}>
                Cerrar
              </button>
            </div>
            <p className="text-2xl font-semibold text-[var(--pf-navy)]">
              {totalAmount} {currency}
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Pagos</p>
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
            {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <button
              type="button"
              disabled={pending}
              onClick={onCharge}
              className="h-12 w-full rounded-xl bg-[#f5c518] text-sm font-semibold text-[#1a1403] disabled:opacity-60"
            >
              {pending ? "Cobrando…" : "Confirmar cobro"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
