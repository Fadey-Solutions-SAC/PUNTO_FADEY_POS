/**
 * Modo sin conexión.
 *
 * - Las ventas que no llegan al servidor (sin internet o Render reiniciando) se guardan en este
 *   dispositivo con su clave de idempotencia y se envían solas cuando vuelve la conexión.
 * - El servidor recalcula precios y stock al recibirlas. Si la misma clave llega dos veces,
 *   devuelve la venta ya registrada: reintentar nunca duplica stock ni dinero.
 * - Si el servidor rechaza una venta (stock insuficiente, caja cerrada…), queda marcada con
 *   el motivo para reintentarla o descartarla a mano; no se pierde.
 */
import { confirmSale, HttpError, isOfflineError, type SaleProduct } from "./api"

const QUEUE_KEY = "pf-offline-sales-v1"
const PRODUCTS_KEY = "pf-offline-products-v1"
export const OFFLINE_EVENT = "pf-offline-change"

export type SaleInput = Parameters<typeof confirmSale>[0]

export type QueuedLine = { productId?: string; name: string; presentationName: string; quantity: number; unitPriceCents: number }

export type QueuedSale = {
  id: string
  createdAt: string
  input: SaleInput
  lines: QueuedLine[]
  totalCents: number
  discountCents: number
  receivedCents: number
  changeCents: number
  currency: string
  status: "pending" | "error"
  error?: string
  attempts: number
  saleId?: string
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

function notify() {
  window.dispatchEvent(new Event(OFFLINE_EVENT))
}

export function listQueuedSales(): QueuedSale[] {
  return read<QueuedSale[]>(QUEUE_KEY, [])
}

export function getQueuedSale(id: string) {
  return listQueuedSales().find((item) => item.id === id) ?? null
}

function saveQueue(items: QueuedSale[]) {
  write(QUEUE_KEY, items)
  notify()
}

export function pendingCount() {
  return listQueuedSales().length
}

function stamp(date: Date) {
  return date.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function enqueueSale(sale: Omit<QueuedSale, "status" | "attempts" | "createdAt">) {
  const createdAt = new Date()
  const note = `Venta sin conexión del ${stamp(createdAt)}`
  const input = { ...sale.input, notes: [sale.input.notes, note].filter(Boolean).join(" · ") }
  const items = listQueuedSales().filter((item) => item.id !== sale.id)
  items.push({ ...sale, input, createdAt: createdAt.toISOString(), status: "pending", attempts: 0 })
  saveQueue(items)
  return items[items.length - 1]
}

export function discardQueuedSale(id: string) {
  saveQueue(listQueuedSales().filter((item) => item.id !== id))
}

/**
 * Cobra en el servidor y, si no hay conexión, guarda la venta para enviarla después.
 * Devuelve `offline: true` cuando quedó en cola.
 */
export async function confirmSaleOrQueue(
  input: SaleInput,
  local: Omit<QueuedSale, "status" | "attempts" | "createdAt" | "input" | "id">,
): Promise<{ offline: false; saleId: string } | { offline: true; id: string }> {
  try {
    const result = await confirmSale(input)
    return { offline: false, saleId: result.saleId }
  } catch (error) {
    if (!isOfflineError(error)) throw error
    const queued = enqueueSale({ ...local, id: input.idempotencyKey, input })
    adjustCachedStock(local.lines)
    return { offline: true, id: queued.id }
  }
}

let syncing: Promise<SyncResult> | null = null

export type SyncResult = { sent: number; failed: number; pending: number; offline: boolean }

/** Envía la cola en orden. Para al primer corte de red; un rechazo del servidor marca la venta y sigue. */
export function syncQueuedSales(options: { retryErrors?: boolean } = {}): Promise<SyncResult> {
  if (syncing) return syncing
  syncing = (async () => {
    let sent = 0
    let failed = 0
    let offline = false
    for (const item of listQueuedSales()) {
      if (item.status === "error" && !options.retryErrors) continue
      try {
        const result = await confirmSale(item.input)
        sent += 1
        const rest = listQueuedSales().filter((row) => row.id !== item.id)
        saveQueue(rest)
        rememberSynced(item.id, result.saleId)
      } catch (error) {
        if (isOfflineError(error)) {
          offline = true
          break
        }
        if (error instanceof HttpError && error.status === 401) {
          // Sesión vencida: se reintenta tras volver a entrar, sin marcarla como fallida.
          offline = true
          break
        }
        failed += 1
        const message = error instanceof Error ? error.message : "Rechazada por el servidor"
        saveQueue(
          listQueuedSales().map((row) =>
            row.id === item.id ? { ...row, status: "error", error: message, attempts: row.attempts + 1 } : row,
          ),
        )
      }
    }
    return { sent, failed, pending: pendingCount(), offline }
  })().finally(() => {
    syncing = null
  })
  return syncing
}

const SYNCED_KEY = "pf-offline-synced-v1"

function rememberSynced(id: string, saleId: string) {
  const map = read<Record<string, string>>(SYNCED_KEY, {})
  map[id] = saleId
  const entries = Object.entries(map).slice(-50)
  write(SYNCED_KEY, Object.fromEntries(entries))
}

/** Si una venta en cola ya se sincronizó, devuelve el id real de la venta. */
export function syncedSaleId(id: string) {
  return read<Record<string, string>>(SYNCED_KEY, {})[id] ?? null
}

let started = false

/** Sincroniza al volver la conexión, al abrir la app y cada 30 s mientras haya cola. */
export function startOfflineSync() {
  if (started) return
  started = true
  const run = () => {
    if (pendingCount() > 0 && navigator.onLine !== false) void syncQueuedSales()
  }
  window.addEventListener("online", run)
  window.setInterval(run, 30_000)
  window.setTimeout(run, 1500)
}

// ---- Catálogo para vender sin conexión ----

type CachedProducts = { savedAt: string; currency: string; products: (SaleProduct & { barcodes?: string[] })[] }

export function cacheProducts(currency: string, products: SaleProduct[]) {
  write(PRODUCTS_KEY, { savedAt: new Date().toISOString(), currency, products } satisfies CachedProducts)
}

export function cachedProducts(): CachedProducts | null {
  return read<CachedProducts | null>(PRODUCTS_KEY, null)
}

export function searchCachedProducts(q: string, brandId?: string) {
  const cache = cachedProducts()
  if (!cache) return null
  const text = q.trim().toLowerCase()
  return {
    currency: cache.currency,
    products: cache.products.filter((product) => {
      if (brandId && product.brandId !== brandId) return false
      if (!text) return true
      return (
        product.name.toLowerCase().includes(text) ||
        product.code?.toLowerCase().includes(text) ||
        (product.barcodes ?? []).some((code) => code.toLowerCase().includes(text))
      )
    }),
  }
}

export function lookupCachedProduct(code: string) {
  const cache = cachedProducts()
  if (!cache) return null
  const text = code.trim().toLowerCase()
  return (
    cache.products.find(
      (product) => product.code?.toLowerCase() === text || (product.barcodes ?? []).some((item) => item.toLowerCase() === text),
    ) ?? null
  )
}

/** Descuenta en la copia local el stock de lo vendido sin conexión (solo para mostrarlo). */
function adjustCachedStock(lines: (QueuedLine & { productId?: string })[]) {
  const cache = cachedProducts()
  if (!cache) return
  const sold = new Map<string, number>()
  for (const line of lines) if (line.productId) sold.set(line.productId, (sold.get(line.productId) ?? 0) + line.quantity)
  cache.products = cache.products.map((product) => {
    const qty = sold.get(product.id)
    if (!qty || typeof product.stock !== "number") return product
    const stock = product.stock - qty
    return { ...product, stock, stockLabel: String(Math.round(stock * 10000) / 10000) }
  })
  write(PRODUCTS_KEY, cache)
}

/** Al cerrar sesión: borra la copia local de datos del negocio (no la cola de ventas). */
export function clearOfflineCache() {
  try {
    localStorage.removeItem(PRODUCTS_KEY)
  } catch {
    /* noop */
  }
  navigator.serviceWorker?.controller?.postMessage({ type: "clear-api-cache" })
}
