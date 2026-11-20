import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  getSaleStatus,
  isOfflineError,
  isServerReachable,
  lookupSaleProduct,
  searchSaleProducts,
  SERVER_EVENT,
  type SaleProduct,
} from "../api"
import {
  cacheProducts,
  confirmSaleOrQueue,
  lookupCachedProduct,
  pendingCount,
  searchCachedProducts,
  OFFLINE_EVENT,
} from "../offline"
import { CodeField, playScanPit, ScannerButton } from "../components/Scanner"
import { categoryColor, tint } from "../colors"
import { ProductPhoto } from "../components/ProductPhoto"

type CartLine = SaleProduct & { quantity: number; key: string }
type PayRow = { method: string; amount: string }

const LOW_STOCK = 5

function money(cents: number) {
  return (cents / 100).toFixed(2)
}

function toCents(value: string) {
  const raw = Number(String(value).replace(",", ".") || 0)
  return Number.isFinite(raw) ? Math.round(raw * 100) : 0
}

/** Billetes sugeridos por encima del total (en céntimos). */
function quickCash(totalCents: number) {
  const bills = [1000, 2000, 5000, 10000, 20000]
  const out = new Set<number>([totalCents])
  for (const bill of bills) {
    const rounded = Math.ceil(totalCents / bill) * bill
    if (rounded > totalCents) out.add(rounded)
  }
  return [...out].sort((a, b) => a - b).slice(0, 5)
}

export function SalesPage() {
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
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
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [cart, setCart] = useState<CartLine[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [discount, setDiscount] = useState("")
  const [discountMode, setDiscountMode] = useState<"money" | "percent">("money")
  const [payments, setPayments] = useState<PayRow[]>([{ method: "CASH", amount: "" }])
  const [paying, setPaying] = useState(false)
  const [payKey, setPayKey] = useState("")
  const [flash, setFlash] = useState<{ text: string; tone: "ok" | "warn" } | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const [usingCache, setUsingCache] = useState(false)
  const [queued, setQueued] = useState(() => pendingCount())

  useEffect(() => {
    const sync = () => setQueued(pendingCount())
    const server = () => setUsingCache(!isServerReachable())
    server()
    window.addEventListener(OFFLINE_EVENT, sync)
    window.addEventListener(SERVER_EVENT, server)
    return () => {
      window.removeEventListener(OFFLINE_EVENT, sync)
      window.removeEventListener(SERVER_EVENT, server)
    }
  }, [])

  useEffect(() => {
    const STATUS_KEY = "pf-offline-sale-status-v1"
    getSaleStatus()
      .then((status) => {
        try {
          localStorage.setItem(STATUS_KEY, JSON.stringify(status))
        } catch {
          /* noop */
        }
        return status
      })
      .catch((err: unknown) => {
        // Sin conexión: usa el último estado conocido para seguir vendiendo.
        if (!isOfflineError(err)) throw err
        const raw = (() => {
          try {
            return localStorage.getItem(STATUS_KEY)
          } catch {
            return null
          }
        })()
        if (!raw) throw err
        setUsingCache(true)
        return JSON.parse(raw) as Awaited<ReturnType<typeof getSaleStatus>>
      })
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
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  useEffect(() => {
    if (!canSell) return
    setLoadingProducts(true)
    const handle = window.setTimeout(() => {
      searchSaleProducts(query, categoryId || undefined)
        .then((data) => {
          if (!isServerReachable()) {
            // Copia del service worker: se prefiere la local, que ya descuenta lo vendido sin conexión.
            const local = searchCachedProducts(query, categoryId || undefined)
            if (local) data = local
          }
          setProducts(data.products)
          setCurrency(data.currency)
          // Si la respuesta vino de la copia del service worker, no se reescribe la copia local.
          if (isServerReachable() && !query.trim() && !categoryId) cacheProducts(data.currency, data.products)
        })
        .catch(() => {
          const local = searchCachedProducts(query, categoryId || undefined)
          if (local) {
            setProducts(local.products)
            setCurrency(local.currency)
            setUsingCache(true)
          } else {
            setProducts([])
          }
        })
        .finally(() => setLoadingProducts(false))
    }, 180)
    return () => window.clearTimeout(handle)
  }, [query, categoryId, canSell])

  useEffect(() => {
    if (!flash) return
    const handle = window.setTimeout(() => setFlash(null), 1800)
    return () => window.clearTimeout(handle)
  }, [flash])

  const subtotalCents = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
    [cart],
  )

  const discountCents = useMemo(() => {
    const raw = Number(discount.replace(",", ".") || 0)
    if (!Number.isFinite(raw) || raw <= 0) return 0
    if (discountMode === "percent") return Math.min(subtotalCents, Math.round((subtotalCents * Math.min(raw, 100)) / 100))
    return Math.min(subtotalCents, Math.round(raw * 100))
  }, [discount, discountMode, subtotalCents])

  const totalCents = Math.max(0, subtotalCents - discountCents)
  const totalAmount = money(totalCents)
  const cartUnits = cart.reduce((sum, line) => sum + line.quantity, 0)
  const qtyInCart = useMemo(() => {
    const map = new Map<string, number>()
    for (const line of cart) map.set(line.key, line.quantity)
    return map
  }, [cart])

  const paidCents = payments.reduce((sum, row) => sum + toCents(row.amount), 0)
  const cashCents = payments.filter((row) => row.method === "CASH").reduce((sum, row) => sum + toCents(row.amount), 0)
  const missingCents = Math.max(0, totalCents - paidCents)
  const changeCents = Math.max(0, paidCents - totalCents)
  const changeInvalid = changeCents > 0 && cashCents < changeCents

  function addProduct(product: SaleProduct) {
    const key = `${product.id}:${product.presentationId}`
    setCart((current) => {
      const existing = current.find((line) => line.key === key)
      if (existing) {
        return current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line))
      }
      return [...current, { ...product, quantity: 1, key }]
    })
    const already = qtyInCart.get(key) ?? 0
    const lowStock = typeof product.stock === "number" && product.stock < already + 1
    setFlash(
      lowStock
        ? { text: `${product.name}: stock insuficiente (${product.stockLabel ?? 0})`, tone: "warn" }
        : { text: `${product.name} agregado`, tone: "ok" },
    )
  }

  async function onCode(code: string) {
    try {
      const data = await lookupSaleProduct(code).catch((err: unknown) => {
        if (!isOfflineError(err)) throw err
        return { product: lookupCachedProduct(code) }
      })
      if (!data.product) {
        setFlash({ text: `Código ${code} no registrado`, tone: "warn" })
        return
      }
      playScanPit()
      addProduct(data.product)
    } catch (err) {
      setFlash({ text: err instanceof Error ? err.message : "No se pudo leer el código", tone: "warn" })
    }
  }

  function commitSearch(raw?: string) {
    const text = (raw ?? query).trim()
    if (!text) return
    const lower = text.toLowerCase()
    const exact = products.filter(
      (item) => item.code?.toLowerCase() === lower || item.name.toLowerCase() === lower,
    )
    const pick = exact.length === 1 ? exact[0] : products.length === 1 ? products[0] : null
    if (pick) {
      addProduct(pick)
      setQuery("")
      return
    }
    // Sin coincidencia única: probablemente es un código de barras.
    void onCode(text).then(() => setQuery(""))
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

  const openPay = useCallback(() => {
    if (!cart.length || cashOpen !== true) return
    setError("")
    setPayKey(crypto.randomUUID())
    setPayments([{ method: methods[0]?.code ?? "CASH", amount: totalAmount }])
    setSheetOpen(false)
    setPaying(true)
  }, [cart.length, cashOpen, methods, totalAmount])

  async function onCharge() {
    if (!cart.length || pending) return
    if (missingCents > 0) {
      setError(`Falta cubrir ${money(missingCents)} ${currency}`)
      return
    }
    if (changeInvalid) {
      setError("El vuelto solo puede salir del efectivo")
      return
    }
    setPending(true)
    setError("")
    try {
      const payRows = payments.filter((row) => toCents(row.amount) > 0)
      const rows = payRows.length ? payRows : [{ method: "CASH", amount: totalAmount }]
      const result = await confirmSaleOrQueue(
        {
          idempotencyKey: payKey || crypto.randomUUID(),
          discount: money(discountCents),
          lines: cart.map((line) => ({
            productId: line.id,
            presentationId: line.presentationId,
            quantity: String(line.quantity),
          })),
          payments: rows,
        },
        {
          lines: cart.map((line) => ({
            productId: line.id,
            name: line.name,
            presentationName: line.presentationName,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
          })),
          totalCents,
          discountCents,
          receivedCents: paidCents,
          changeCents,
          currency,
        },
      )
      setCart([])
      setDiscount("")
      setPaying(false)
      if (result.offline) {
        navigate(`/ventas/pendiente/${result.id}`)
        return
      }
      navigate(`/ventas/${result.saleId}/ticket`, {
        state: changeCents > 0 ? { received: money(paidCents), change: money(changeCents), currency } : undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cobrar")
    } finally {
      setPending(false)
    }
  }

  // Atajos: F2 cobra, F3 o "/" busca, Esc cierra.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing = target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")
      if (event.key === "F2") {
        event.preventDefault()
        if (!paying) openPay()
      } else if (event.key === "F3" || (event.key === "/" && !typing)) {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (event.key === "Escape") {
        if (paying && !pending) setPaying(false)
        else setSheetOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openPay, paying, pending])

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
        <Accesses items={accesses} />
      </div>
    )
  }

  if (!canSell) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">No tienes permiso de venta.</p>
        <Accesses items={accesses} />
      </div>
    )
  }

  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="font-semibold text-[var(--pf-navy)]">Carrito</h2>
          <p className="text-xs text-slate-500">
            {cartUnits} {cartUnits === 1 ? "unidad" : "unidades"} · {cart.length} {cart.length === 1 ? "producto" : "productos"}
          </p>
        </div>
        {cart.length > 0 ? (
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            onClick={() => {
              if (window.confirm("¿Vaciar el carrito?")) setCart([])
            }}
          >
            Vaciar
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {cart.length === 0 ? (
          <div className="grid place-items-center gap-1 py-10 text-center text-sm text-slate-400">
            <span className="text-3xl" aria-hidden>
              🛒
            </span>
            Toca un producto o escanea un código
          </div>
        ) : null}
        {cart.map((line) => {
          const short = typeof line.stock === "number" && line.quantity > line.stock
          return (
            <div key={line.key} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--pf-navy)]">{line.name}</p>
                  <p className="text-xs text-slate-500">
                    {line.presentationName} · {line.unitPriceLabel}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-teal-700">
                  {money(line.unitPriceCents * line.quantity)}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <button
                    type="button"
                    aria-label={`Quitar uno de ${line.name}`}
                    className="grid size-8 place-items-center text-lg text-slate-600 hover:bg-slate-100"
                    onClick={() => changeQty(line.key, line.quantity - 1)}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label={`Cantidad de ${line.name}`}
                    value={line.quantity}
                    onChange={(event) => changeQty(line.key, Math.max(1, Math.floor(Number(event.target.value)) || 1))}
                    className="h-8 w-12 border-x border-slate-200 text-center text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    aria-label={`Agregar uno de ${line.name}`}
                    className="grid size-8 place-items-center text-lg text-slate-600 hover:bg-slate-100"
                    onClick={() => changeQty(line.key, line.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                {short ? <span className="text-xs font-medium text-amber-700">Stock {line.stockLabel}</span> : null}
                <button
                  type="button"
                  className="ml-auto text-xs text-slate-400 hover:text-red-700"
                  onClick={() => changeQty(line.key, 0)}
                >
                  Quitar
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Descuento</span>
          <div className="ml-auto flex overflow-hidden rounded-lg border border-slate-200">
            <input
              inputMode="decimal"
              className="h-8 w-20 px-2 text-right tabular-nums outline-none"
              value={discount}
              placeholder="0"
              onChange={(event) => setDiscount(event.target.value)}
              aria-label="Descuento"
            />
            <select
              className="h-8 border-l border-slate-200 bg-slate-50 px-1.5 text-xs"
              value={discountMode}
              onChange={(event) => setDiscountMode(event.target.value as "money" | "percent")}
              aria-label="Tipo de descuento"
            >
              <option value="money">{currency === "PEN" ? "S/" : currency}</option>
              <option value="percent">%</option>
            </select>
          </div>
        </div>
        <div className="flex justify-between text-slate-500">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(subtotalCents)}</span>
        </div>
        {discountCents > 0 ? (
          <div className="flex justify-between text-emerald-700">
            <span>Descuento</span>
            <span className="tabular-nums">−{money(discountCents)}</span>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between pt-1 text-[var(--pf-navy)]">
          <span className="font-semibold">Total</span>
          <span className="bg-gradient-to-r from-teal-600 to-sky-600 bg-clip-text text-3xl font-extrabold tabular-nums text-transparent">
            {totalAmount} <span className="text-sm font-semibold">{currency}</span>
          </span>
        </div>
        <button
          type="button"
          disabled={pending || cart.length === 0 || cashOpen !== true}
          onClick={openPay}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f5c518] text-base font-semibold text-[#1a1403] shadow-sm transition hover:brightness-95 disabled:opacity-50"
        >
          Cobrar
          <kbd className="hidden rounded bg-black/10 px-1.5 text-[10px] font-medium lg:inline">F2</kbd>
        </button>
        {error && !paying ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </div>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-7xl pb-24 lg:pb-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {registerName ? `${registerName} abierta` : "Caja abierta"}
        </span>
        <span className="text-xs text-slate-500">
          {openedAtLabel ?? ""}
          {openingLabel ? ` · efectivo inicial ${openingLabel}` : ""}
        </span>
        <Link to="/ventas/historial" className="ml-auto text-xs font-medium text-[var(--pf-accent)] hover:underline">
          Historial de ventas
        </Link>
      </div>

      {usingCache ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span aria-hidden>📴</span>
          <span>
            <b>Sin conexión.</b> Puedes seguir vendiendo: las ventas se guardan en este equipo y se envían solas al volver
            internet. Precios y stock son los últimos que se cargaron.
          </span>
        </div>
      ) : null}
      {queued > 0 ? (
        <Link
          to="/ventas/sincronizar"
          className="mb-3 flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100"
        >
          <span className="grid size-6 place-items-center rounded-full bg-sky-600 text-xs font-bold text-white">{queued}</span>
          {queued === 1 ? "venta guardada sin conexión" : "ventas guardadas sin conexión"} · ver y sincronizar
        </Link>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex gap-2">
            <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-within:border-[var(--pf-accent)] focus-within:ring-2 focus-within:ring-[var(--pf-accent)]/15">
              <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    commitSearch(event.currentTarget.value)
                  }
                }}
                placeholder="Buscar por nombre o código y Enter…"
                className="min-w-0 flex-1 bg-transparent outline-none"
                aria-label="Buscar producto"
              />
              {query ? (
                <button type="button" className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setQuery("")}>
                  Limpiar
                </button>
              ) : (
                <kbd className="hidden rounded border border-slate-200 px-1.5 text-[10px] text-slate-400 sm:inline">F3</kbd>
              )}
            </label>
            <ScannerButton onCode={onCode} />
          </div>
          {hardwareReader ? <CodeField onCode={onCode} autoFocus placeholder="Lector USB o Bluetooth" /> : null}

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <Chip active={categoryId === ""} onClick={() => setCategoryId("")}>
              Todos
            </Chip>
            {categories.map((category) => (
              <Chip key={category.id} color={categoryColor(category.id)} active={categoryId === category.id} onClick={() => setCategoryId(category.id)}>
                {category.name}
              </Chip>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const key = `${product.id}:${product.presentationId}`
              const inCart = qtyInCart.get(key) ?? 0
              const stock = product.stock
              const out = typeof stock === "number" && stock <= 0
              const low = typeof stock === "number" && stock > 0 && stock <= LOW_STOCK
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => addProduct(product)}
                  aria-label={`Agregar ${product.name}`}
                  className={`group relative flex min-h-28 flex-col rounded-2xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.98] ${
                    inCart > 0
                      ? "border-[var(--pf-accent)] ring-2 ring-[var(--pf-accent)]/20"
                      : "border-slate-200 hover:border-[var(--pf-accent)]/50 hover:shadow"
                  } ${out ? "opacity-60" : ""}`}
                >
                  <span
                    aria-hidden
                    className="absolute inset-x-3 top-0 h-1 rounded-b-full"
                    style={{ background: categoryColor(product.categoryId) }}
                  />
                  {inCart > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 grid min-w-6 place-items-center rounded-full bg-[var(--pf-accent)] px-1.5 text-xs font-bold text-white shadow">
                      {inCart}
                    </span>
                  ) : null}
                  <span className="flex items-start gap-2">
                    <ProductPhoto name={product.name} imagePath={product.imagePath} categoryId={product.categoryId} size={36} />
                    <span className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--pf-navy)]">{product.name}</span>
                  </span>
                  <span className="mt-0.5 truncate text-[11px] text-slate-400">
                    {product.code} · {product.presentationName}
                  </span>
                  <span className="mt-auto flex items-end justify-between gap-1 pt-2">
                    <span className="text-lg font-extrabold tabular-nums" style={{ color: categoryColor(product.categoryId) }}>
                      {product.unitPriceLabel}
                    </span>
                    {typeof stock === "number" ? (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                          out ? "bg-red-50 text-red-700" : low ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {out ? "Agotado" : `${product.stockLabel} ${product.unit ?? ""}`.trim()}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}
            {!loadingProducts && products.length === 0 ? (
              <p className="col-span-full rounded-xl bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
                {query ? `Sin resultados para “${query}”. Pulsa Enter para buscarlo como código.` : "Sin productos para mostrar."}
              </p>
            ) : null}
            {loadingProducts && products.length === 0
              ? Array.from({ length: 8 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />)
              : null}
          </div>

          <Accesses items={accesses} />
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-0 h-[calc(100dvh-7.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {cartPanel}
          </div>
        </aside>
      </div>

      {/* Barra inferior en teléfono/tablet: no empuja la lista al agregar. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left"
            aria-label="Ver carrito"
          >
            <span className="grid size-7 place-items-center rounded-full bg-[var(--pf-accent)] text-xs font-bold text-white">{cartUnits}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] leading-tight text-slate-500">Total</span>
              <span className="block truncate text-lg font-bold leading-tight tabular-nums text-[var(--pf-navy)]">
                {totalAmount} {currency}
              </span>
            </span>
            <span className="text-xs font-medium text-[var(--pf-accent)]">Ver</span>
          </button>
          <button
            type="button"
            disabled={pending || cart.length === 0}
            onClick={openPay}
            className="h-12 rounded-xl bg-[#f5c518] px-6 text-sm font-semibold text-[#1a1403] disabled:opacity-50"
          >
            Cobrar
          </button>
        </div>
      </div>

      {sheetOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-[var(--pf-navy)]/50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Carrito"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSheetOpen(false)
          }}
        >
          <div className="h-[85dvh] w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl">
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200" />
            {cartPanel}
          </div>
        </div>
      ) : null}

      {flash ? (
        <div
          role="status"
          className={`pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lg lg:bottom-6 ${
            flash.tone === "ok" ? "bg-[var(--pf-navy)] text-white" : "bg-amber-500 text-white"
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      {paying ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[var(--pf-navy)]/50 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cobro"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setPaying(false)
          }}
        >
          <form
            className="max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-lg space-y-4 overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 shadow-xl sm:p-5"
            onSubmit={(event) => {
              event.preventDefault()
              void onCharge()
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Cobrar</h2>
              <button type="button" className="text-sm text-slate-500 hover:text-slate-800" disabled={pending} onClick={() => setPaying(false)}>
                Cerrar <kbd className="ml-1 hidden rounded border border-slate-200 px-1 text-[10px] sm:inline">Esc</kbd>
              </button>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-sky-700 px-4 py-3 text-white shadow-md">
              <p className="text-xs uppercase tracking-wide text-white/70">Total a cobrar</p>
              <p className="truncate text-3xl font-bold tabular-nums">
                {totalAmount} <span className="text-base font-medium text-white/70">{currency}</span>
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Pagos</p>
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--pf-accent)]"
                  onClick={() =>
                    setPayments((current) => [
                      ...current,
                      { method: methods.find((item) => item.code !== "CASH")?.code ?? methods[0]?.code ?? "CASH", amount: money(Math.max(0, totalCents - current.reduce((s, r) => s + toCents(r.amount), 0))) },
                    ])
                  }
                >
                  + Pago mixto
                </button>
              </div>
              {payments.map((row, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] items-center gap-2">
                  <select
                    className="h-11 w-full min-w-0 truncate rounded-xl border border-slate-200 px-2 text-sm"
                    value={row.method}
                    onChange={(event) => updatePayment(index, { method: event.target.value })}
                    aria-label="Medio de pago"
                  >
                    {methods.map((method) => (
                      <option key={method.code} value={method.code}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                  <input
                    autoFocus={index === 0}
                    inputMode="decimal"
                    className="h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-right text-base tabular-nums outline-none focus:border-[var(--pf-accent)] focus:ring-2 focus:ring-[var(--pf-accent)]/15"
                    value={row.amount}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => updatePayment(index, { amount: event.target.value })}
                    placeholder="0.00"
                    aria-label="Monto recibido"
                  />
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-red-700 disabled:invisible"
                    disabled={payments.length === 1}
                    onClick={() => setPayments((current) => current.filter((_, i) => i !== index))}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>

            {payments.length === 1 && payments[0].method === "CASH" ? (
              <div>
                <p className="mb-1.5 text-xs text-slate-500">Efectivo recibido</p>
                <div className="flex flex-wrap gap-2">
                  {quickCash(totalCents).map((cents) => (
                    <button
                      key={cents}
                      type="button"
                      onClick={() => updatePayment(0, { amount: money(cents) })}
                      className={`h-10 min-w-[4.5rem] flex-1 rounded-xl border px-3 text-sm font-medium tabular-nums sm:flex-none ${
                        toCents(payments[0].amount) === cents
                          ? "border-[var(--pf-accent)] bg-[var(--pf-accent)] text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-[var(--pf-accent)]/50"
                      }`}
                    >
                      {cents === totalCents ? "Exacto" : money(cents)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 text-sm [&>*]:min-w-0">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Recibido</p>
                <p className="text-lg font-semibold tabular-nums text-[var(--pf-navy)]">{money(paidCents)}</p>
              </div>
              {missingCents > 0 ? (
                <div className="rounded-xl bg-red-50 px-3 py-2">
                  <p className="text-xs text-red-700">Falta</p>
                  <p className="text-lg font-semibold tabular-nums text-red-700">{money(missingCents)}</p>
                </div>
              ) : (
                <div className={`rounded-xl px-3 py-2 ${changeInvalid ? "bg-red-50" : "bg-emerald-50"}`}>
                  <p className={`text-xs ${changeInvalid ? "text-red-700" : "text-emerald-700"}`}>Vuelto</p>
                  <p className={`text-2xl font-bold tabular-nums ${changeInvalid ? "text-red-700" : "text-emerald-700"}`}>
                    {money(changeCents)}
                  </p>
                </div>
              )}
            </div>

            {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <button
              type="submit"
              disabled={pending || missingCents > 0 || changeInvalid}
              className="h-12 w-full rounded-xl bg-[#f5c518] text-base font-semibold text-[#1a1403] transition hover:brightness-95 disabled:opacity-50"
            >
              {pending ? "Cobrando…" : "Confirmar cobro"}
              {!pending ? <kbd className="ml-2 hidden rounded bg-black/10 px-1.5 text-[10px] font-medium sm:inline">Enter</kbd> : null}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  color?: string
}) {
  const c = color ?? "#0f172a"
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-sm ring-1 transition"
      style={
        active
          ? { background: c, color: "#fff", boxShadow: `0 0 0 1px ${c}` }
          : { background: color ? tint(c, 0.1) : "#fff", color: color ? c : "#334155", boxShadow: `0 0 0 1px ${tint(c, 0.3)}` }
      }
    >
      {color ? <span className="size-2 rounded-full" style={{ background: active ? "#fff" : c }} /> : null}
      {children}
    </button>
  )
}

function Accesses({ items }: { items: { href: string; label: string }[] }) {
  if (items.length === 0) return null
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--pf-navy)]">Accesos de caja</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => (
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
  )
}
