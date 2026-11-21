export type ApiError = { error: string }

/** Sin red, o Render reiniciando (502/503/504): la operación no llegó al servidor. */
export class OfflineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OfflineError"
  }
}

/** Respuesta del servidor con error (400 validación, 401 sin sesión, etc.). */
export class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "HttpError"
    this.status = status
  }
}

export function isOfflineError(error: unknown) {
  return error instanceof OfflineError
}

/** ¿Respondió el servidor en la última petición? (no basta con navigator.onLine: puede haber red sin servidor). */
export const SERVER_EVENT = "pf-server-status"
let serverReachable = true

export function isServerReachable() {
  return serverReachable
}

function markServer(reachable: boolean) {
  if (reachable === serverReachable) return
  serverReachable = reachable
  window.dispatchEvent(new CustomEvent(SERVER_EVENT, { detail: reachable }))
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      ...init,
    })
  } catch {
    markServer(false)
    throw new OfflineError("Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.")
  }
  markServer(res.headers.get("X-PF-Offline") !== "1" && ![502, 503, 504].includes(res.status))
  const data = (await res.json().catch(() => ({}))) as T & ApiError
  if (!res.ok) {
    if (!data.error && (res.status === 502 || res.status === 503 || res.status === 504)) {
      // Render reinicia el servicio durante un despliegue: la operación no llegó al servidor.
      throw new OfflineError("El sistema se está actualizando. Espera unos segundos y vuelve a intentar.")
    }
    throw new HttpError(data.error || `Error ${res.status}`, res.status)
  }
  return data
}

export function getBootstrap() {
  return request<{ needsSetup: boolean; version: string }>("/api/auth/bootstrap")
}

export function getMe() {
  return request<{
    user: { id: string; name: string; email: string; role: string; configMode: boolean }
    business: { id: string; name: string; currency: string }
    branchId: string
    warehouseId: string
  }>("/api/auth/me")
}

export function login(username: string, password: string) {
  return request<{ ok: true; configMode: boolean }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
}

export function logout() {
  return request<{ ok: true }>("/api/auth/logout", { method: "POST" })
}

export function getVersion() {
  return request<{ version: string; label: string; nextStillPrimary?: boolean }>("/api/version")
}

export type MoneyOut = { cents: number; label: string; amount: string }

export type PanelNotice = {
  id: string
  kind: string
  title: string
  detail: string
  href: string
}

export type PanelBootstrap = {
  user: {
    id: string
    name: string
    role: string
    roleLabel?: string
    detail?: string
    configMode: boolean
  }
  business: { id: string; name: string; currency: string }
  branch: { id: string; name: string }
  warehouse: { id: string; name: string }
  theme?: string
  logo?: string | null
  version?: string
  notices?: PanelNotice[]
  nav: { title: string; items: { href: string; label: string }[] }[]
  permissions: {
    cash: boolean
    cashClose: boolean
    sell: boolean
    voidSale?: boolean
    purchases?: boolean
    reports?: boolean
    catalogWrite?: boolean
  }
}

export type DashboardPayload = {
  currency: string
  salesTotal: MoneyOut
  operations: number
  yesterdaySales: MoneyOut
  yesterdayOperations: number
  income: MoneyOut
  expense: MoneyOut
  profit: MoneyOut
  lossesToday?: MoneyOut
  products: number
  low: number
  empty: number
  payMix: Record<string, MoneyOut & { label: string }>
  days: { label: string; total: MoneyOut }[]
  attention: { name: string; quantityLabel: string; minStockLabel: string }[]
  openBoxes: {
    id: string
    registerName: string
    userName: string
    opening: MoneyOut
    cashSales: MoneyOut
    income: MoneyOut
    expense: MoneyOut
    expected: MoneyOut
  }[]
  lastSales: { id: string; code: string; customerName: string; total: MoneyOut; payments: string }[]
  lastPurchases: { id: string; supplierName: string; total: MoneyOut }[]
}

export function getDashboard() {
  return request<DashboardPayload>("/api/panel/dashboard")
}

export function getPanelBootstrap() {
  return request<PanelBootstrap>("/api/panel/bootstrap")
}

export type CashStatus = {
  currency: string
  assignedRegisterId: string | null
  registers: { id: string; name: string }[]
  session: null | {
    id: string
    registerName: string
    openedAt: string
    opening: MoneyOut
    expected: MoneyOut | null
    byMethod: Record<string, MoneyOut>
    income: MoneyOut | null
    expense: MoneyOut | null
    movements: {
      id: string
      type: string
      typeLabel: string
      reason: string
      createdAt: string
      createdAtLabel: string
      amount: MoneyOut
    }[]
  }
}

export function getCashStatus() {
  return request<CashStatus>("/api/cash/status")
}

export function openCash(cashRegisterId: string, openingAmount: string) {
  return request<{ ok: true; sessionId: string }>("/api/cash/open", {
    method: "POST",
    body: JSON.stringify({ cashRegisterId, openingAmount }),
  })
}

export function addCashMovement(type: string, amount: string, reason: string) {
  return request<{ ok: true; movementId: string }>("/api/cash/movement", {
    method: "POST",
    body: JSON.stringify({ type, amount, reason }),
  })
}

export function getCashHistory() {
  return request<{
    currency: string
    sessions: {
      id: string
      status: string
      registerName: string
      userName: string
      branchName: string
      openedAtLabel: string
      day?: string
      opening: MoneyOut
      expected: MoneyOut | null
      counted: MoneyOut | null
      difference: MoneyOut | null
    }[]
  }>("/api/cash/history")
}

export type ClosePreview = {
  currency: string
  denoms: { key: string; label: string; value: number; kind: "bill" | "coin" }[]
  registerName: string
  opening: MoneyOut
  expectedCash: MoneyOut
  income: MoneyOut
  expense: MoneyOut
  byMethod: Record<string, MoneyOut>
  posRows: { code: string; label: string; expected: MoneyOut }[]
  userName?: string
  openedAtLabel?: string
  shift?: {
    salesCount: number
    salesTotal: MoneyOut
    creditTotal: MoneyOut
    voidedCount: number
    voidedTotal: MoneyOut
    returnsCount: number
    returnsTotal: MoneyOut
    movements: { id: string; typeLabel: string; reason: string; amount: MoneyOut; out: boolean; atLabel: string }[]
  }
}

export function getClosePreview() {
  return request<ClosePreview>("/api/cash/close-preview")
}

export function closeCash(input: {
  counted: string
  notes?: string
  arqueoDetail?: string
  denominations?: Record<string, string>
  /** Monto confirmado por cada otro medio (Yape, tarjeta…). */
  methodCounts?: Record<string, string>
}) {
  return request<{ ok: true }>("/api/cash/close", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export type SaleProduct = {
  id: string
  name: string
  code: string
  presentationId: string
  presentationName: string
  unitPriceCents: number
  unitPriceLabel: string
  categoryId?: string | null
  brandId?: string | null
  brandName?: string | null
  unit?: string
  stock?: number
  stockLabel?: string
  imagePath?: string | null
}

export function getSaleStatus() {
  return request<{
    currency: string
    cashOpen: boolean
    registerName: string | null
    openedAtLabel: string | null
    openingLabel: string | null
    discountLimitPct: number
    hardwareReader: boolean
    canSell: boolean
    allowCredit?: boolean
    canCredit?: boolean
    canCreateCustomer?: boolean
    categories: { id: string; name: string }[]
    brands?: { id: string; name: string }[]
    accesses: { href: string; label: string }[]
    methods: { code: string; label: string }[]
  }>("/api/sales/status")
}

/** brandId: el sistema filtra por marca (ya no por categoría). */
export function searchSaleProducts(q: string, brandId?: string) {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (brandId) params.set("brandId", brandId)
  const query = params.toString()
  return request<{ currency: string; products: SaleProduct[] }>(
    `/api/sales/products${query ? `?${query}` : ""}`,
  )
}

export function lookupSaleProduct(code: string) {
  return request<{ product: SaleProduct | null }>(`/api/sales/lookup?code=${encodeURIComponent(code)}`)
}

export type SaleCustomer = {
  id: string
  name: string
  document: string
  phone: string
  balanceCents: number
  balance: string
  limitCents: number
  limit: string
}

export function searchSaleCustomers(q: string) {
  const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""
  return request<{ customers: SaleCustomer[] }>(`/api/sales/customers${query}`)
}

export function confirmSale(input: {
  idempotencyKey: string
  discount?: string
  notes?: string
  /** CREDIT: queda como deuda del cliente (requiere cliente y permiso). */
  saleType?: "CASH" | "CREDIT"
  customerId?: string
  lines: { productId: string; presentationId: string; quantity: string }[]
  payments: { method: string; amount: string; reference?: string }[]
}) {
  return request<{ ok: true; saleId: string; total: string; totalAmount: string }>("/api/sales/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getSaleTicket(saleId: string, width?: number) {
  return request<{
    saleId: string
    brand?: string
    logo?: string | null
    code: string
    currency: string
    subtotal: string
    discount: string
    total: string
    text: string
    lines: { description: string; quantityLabel: string; unitPrice: string; total: string }[]
    payments: { label: string; amount: string }[]
  }>(`/api/sales/${saleId}/ticket${width ? `?width=${width}` : ""}`)
}

export type HistoryFilters = { desde?: string; hasta?: string; producto?: string; medio?: string }

function historyQuery(filters: HistoryFilters & { status?: string }) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  const text = params.toString()
  return text ? `?${text}` : ""
}

export function getSalesHistory(status?: "VOIDED" | "COMPLETED", filters: HistoryFilters = {}) {
  return request<{
    currency: string
    canVoid: boolean
    canReturn?: boolean
    methods?: { code: string; label: string }[]
    sales: {
      id: string
      code: string
      status: string
      statusLabel: string
      createdAtLabel: string
      customerName: string
      userName: string
      total: string
      totalCents?: number
      products?: string
      voidedAtLabel?: string
      payments: string
    }[]
  }>(`/api/sales/history${historyQuery({ ...filters, status })}`)
}

export function getSalesReturns(filters: HistoryFilters = {}) {
  return request<{
    canReturn: boolean
    returns: {
      id: string
      saleId: string
      saleCode: string
      createdAtLabel: string
      customerName: string
      userName: string
      products: string
      method: string
      total: string
      totalCents: number
    }[]
  }>(`/api/sales/returns${historyQuery(filters)}`)
}

export function getSaleDetail(saleId: string) {
  return request<{
    id: string
    code: string
    status: string
    statusLabel: string
    createdAtLabel: string
    customerName: string
    userName: string
    notes: string | null
    currency: string
    subtotal: string
    discount: string
    total: string
    canVoid: boolean
    lines: { id: string; description: string; quantityLabel: string; unitPrice: string; total: string }[]
    payments: { method: string; label: string; amount: string }[]
  }>(`/api/sales/${saleId}`)
}

export function voidSale(saleId: string, reason: string, stockMode: "restore" | "keep") {
  return request<{ ok: true }>(`/api/sales/${saleId}/void`, {
    method: "POST",
    body: JSON.stringify({ reason, stockMode }),
  })
}

export function getSaleReturn(saleId: string) {
  return request<{
    saleId: string
    code: string
    credit: boolean
    customerName: string
    lines: { id: string; description: string; remaining: number; remainingLabel: string }[]
  }>(`/api/sales/${saleId}/return`)
}

export function submitSaleReturn(
  saleId: string,
  refundMethod: "CASH" | "CREDIT",
  lines: { saleLineId: string; quantity: string }[],
) {
  return request<{ ok: true }>(`/api/sales/${saleId}/return`, {
    method: "POST",
    body: JSON.stringify({ refundMethod, lines }),
  })
}

export function getCatalog() {
  return request<{
    currency: string
    writable: boolean
    categories: { id: string; name: string }[]
    brands?: { id: string; name: string }[]
    products: {
      id: string
      code: string | null
      name: string
      categoryId: string | null
      categoryName: string | null
      brandId?: string | null
      brandName: string | null
      price: string
      stock: string
      active: boolean
      imagePath?: string | null
    }[]
  }>("/api/catalog")
}

export function getCatalogForm() {
  return request<{
    categories: { id: string; name: string }[]
    units: { id: string; name: string; symbol: string }[]
    brands?: { id: string; name: string }[]
  }>("/api/catalog/form")
}

export function getCatalogProduct(id: string) {
  return request<{
    writable: boolean
    values: {
      id: string
      name: string
      internalCode: string
      categoryId: string
      brandName: string
      baseUnitId: string
      description: string
      costPrice: string
      salePrice: string
      wholesalePrice: string
      retailPrice: string
      minStock: string
      maxStock: string
      taxType?: string
      trackLots: boolean
      isActive: boolean
      barcodes: string[]
    }
    imagePath?: string | null
    categories: { id: string; name: string }[]
    brands?: { id: string; name: string }[]
    units: { id: string; name: string; symbol: string }[]
  }>(`/api/catalog/products/${id}`)
}

/** Sube la foto ya reducida (binario). Devuelve la nueva ruta en /uploads. */
export async function uploadProductImage(productId: string, image: Blob) {
  let res: Response
  try {
    res = await fetch(`/api/catalog/products/${productId}/image`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": image.type || "image/jpeg" },
      body: image,
    })
  } catch {
    throw new Error("Sin conexión: la foto se sube cuando vuelva internet.")
  }
  const data = (await res.json().catch(() => ({}))) as { imagePath?: string | null; error?: string }
  if (!res.ok) {
    if (res.status === 413) throw new Error("La imagen supera 2 MB")
    throw new Error(data.error || `Error ${res.status}`)
  }
  return { imagePath: data.imagePath ?? null }
}

export function saveCatalogProduct(input: {
  id?: string
  name: string
  internalCode?: string
  categoryId?: string
  brandName?: string
  baseUnitId: string
  costPrice: string
  salePrice: string
  wholesalePrice: string
  retailPrice: string
  minStock: string
  maxStock?: string
  taxType?: string
  initialQuantity?: string
  trackLots: boolean
  isActive: boolean
  barcodes?: string[]
  presentations?: unknown[]
}) {
  return request<{ ok: true; id: string }>("/api/catalog/products", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function createCatalogCategory(name: string) {
  return request<{ ok: true }>("/api/catalog/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export function getCustomers() {
  return request<{
    currency: string
    customers: {
      id: string
      name: string
      document: string
      phone: string
      email: string
      address: string
      debt: string
      limit: string
      creditLimitAmount: string
      isActive: boolean
    }[]
  }>("/api/customers")
}

export function saveCustomer(input: {
  id?: string
  name: string
  document?: string
  phone?: string
  email?: string
  address?: string
  creditLimit?: string
}) {
  return request<{ ok: true; id: string }>("/api/customers", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getCustomerHistory(cliente?: string) {
  const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : ""
  return request<{
    currency: string
    customers: { id: string; name: string }[]
    sales: {
      id: string
      createdAtLabel: string
      day?: string
      customerName: string
      typeLabel: string
      total: string
    }[]
  }>(`/api/customers/history${q}`)
}

export function getCustomerCredits() {
  return request<{
    currency: string
    methods: { code: string; label: string }[]
    accounts: {
      saleId: string
      customerId: string
      customerName: string
      createdAtLabel: string
      dueCents: number
      due: string
    }[]
  }>("/api/customers/credits")
}

export function postCustomerAbono(input: {
  customerId: string
  saleId: string
  amount: string
  method: string
}) {
  return request<{ ok: true }>("/api/customers/credits/abono", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getCatalogUnits() {
  return request<{
    writable: boolean
    units: { id: string; name: string; symbol: string; dimension: string; dimensionLabel: string }[]
    conversions: { id: string; from: string; to: string; factor: string }[]
  }>("/api/catalog/units")
}

export function createCatalogUnit(input: { name: string; symbol: string; dimension: string }) {
  return request<{ ok: true }>("/api/catalog/units", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getCatalogPresentations() {
  return request<{
    rows: {
      id: string
      productId: string
      productName: string
      name: string
      factorLabel: string
      unitSymbol: string
      imagePath?: string | null
    }[]
  }>("/api/catalog/presentations")
}

export function getCatalogBarcodes() {
  return request<{
    writable: boolean
    products: { id: string; name: string }[]
    codes: { id: string; code: string; productName: string }[]
  }>("/api/catalog/barcodes")
}

export function createCatalogBarcode(productId: string, code: string) {
  return request<{ ok: true }>("/api/catalog/barcodes", {
    method: "POST",
    body: JSON.stringify({ productId, code }),
  })
}

export function getCatalogPrices() {
  return request<{
    currency: string
    canCreateList: boolean
    canSavePrice: boolean
    products: { id: string; name: string }[]
    lists: { id: string; name: string; items: { id: string; productName: string; price: string }[] }[]
  }>("/api/catalog/prices")
}

export function createCatalogPriceList(name: string) {
  return request<{ ok: true; id: string }>("/api/catalog/prices/lists", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export function saveCatalogPriceItem(input: { listId: string; productId: string; price: string }) {
  return request<{ ok: true }>("/api/catalog/prices/items", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getInventoryAlerts() {
  return request<{
    warehouseName: string
    stockAlerts: { id: string; name: string; stock: string; minStock: string; state: string }[]
    lots: { id: string; productName: string; code: string; quantity: string; expiresAtLabel: string; notice: string }[]
  }>("/api/inventory/alerts")
}

export function getInventoryWarehouses() {
  return request<{
    currentWarehouseId: string
    currentBranchId?: string
    canManage?: boolean
    products?: {
      id: string
      name: string
      brand: string
      unit: string
      baseUnitId?: string
      salePrice: string
      costPrice: string
      byWarehouse: Record<string, number>
      total: number
      totalLabel: string
      valueCents: number
      value: string
      state: string
    }[]
    totals?: { items: number; value: string; cost: string; units: number; low: number }
    warehouses: {
      id: string
      name: string
      branch: string
      isDefault: boolean
      inUse: boolean
      branchId?: string
      isActive?: boolean
      withStock?: number
      rows: {
        id: string
        code: string
        name: string
        category: string
        brand: string
        stock: string
        state: string
      }[]
    }[]
  }>("/api/inventory/warehouses")
}

export function getInventoryKardex(producto?: string) {
  const q = producto ? `?producto=${encodeURIComponent(producto)}` : ""
  return request<{
    movements: {
      id: string
      createdAtLabel: string
      day?: string
      warehouseName: string
      productName: string
      typeLabel: string
      quantityLabel: string
      balanceLabel: string
      userName: string
      reason: string
    }[]
  }>(`/api/inventory/kardex${q}`)
}

export function getInventoryTransfers() {
  return request<{
    currentWarehouseId: string
    products: { id: string; name: string; barcodes: string[] }[]
    warehouses: { id: string; name: string }[]
    transfers: {
      id: string
      createdAtLabel: string
      route: string
      status: string
      statusLabel: string
      userName: string
      detail: string
      canReceive: boolean
    }[]
  }>("/api/inventory/transfers")
}

export function sendInventoryTransfer(input: {
  fromWarehouseId: string
  toWarehouseId: string
  notes?: string
  lines: { productId: string; quantity: string; presentationId?: string }[]
  /** true: se envía y se recibe en un solo paso (mover desde Almacenes). */
  receiveNow?: boolean
}) {
  return request<{ ok: true; id: string }>("/api/inventory/transfers", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function receiveInventoryTransfer(id: string) {
  return request<{ ok: true }>(`/api/inventory/transfers/${id}/receive`, { method: "POST" })
}

export function cancelInventoryTransfer(id: string) {
  return request<{ ok: true }>(`/api/inventory/transfers/${id}/cancel`, { method: "POST" })
}

export function getInventoryAdjustments() {
  return request<{
    warehouseName: string
    products: {
      id: string
      code: string
      name: string
      brand: string
      category: string
      stock: string
      unit: string
      min: string
      presentationId: string
      trackLots: boolean
      lots: { code: string; quantity: string; expiresAt: string }[]
    }[]
  }>("/api/inventory/adjustments")
}

export function postInventoryAdjustment(input: {
  productId: string
  warehouseId?: string
  presentationId?: string
  quantity: string
  reason: string
  lotCode?: string
  expiresAt?: string
}) {
  return request<{ ok: true }>("/api/inventory/adjustments", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getSuppliers() {
  return request<{
    suppliers: {
      id: string
      tradeName: string
      taxId: string
      phone: string
      email: string
      legalName?: string
      contact?: string
      address?: string
      paymentTerm?: string
      creditDays?: number | null
      isActive: boolean
    }[]
  }>("/api/purchases/suppliers")
}

export function saveSupplier(input: {
  tradeName: string
  legalName?: string
  taxId?: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  paymentTerm?: string
  creditDays?: string
}) {
  return request<{ ok: true; id: string }>("/api/purchases/suppliers", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getPurchaseHistory() {
  return request<{
    currency: string
    purchases: {
      id: string
      createdAtLabel: string
      day?: string
      supplierName: string
      documentNumber: string
      statusLabel: string
      total: string
      debt: string
    }[]
  }>("/api/purchases/history")
}

export function getPurchaseRequirement() {
  return request<{
    warehouseName: string
    products: {
      productId: string
      name: string
      categoryName: string | null
      unit: string
      stock: string
      minStock: string
      maxStock: string | null
      quantity: string
    }[]
  }>("/api/purchases/requirement")
}

export function savePurchaseRequirement(lines: { productId: string; quantity: string }[]) {
  return request<{ ok: true }>("/api/purchases/requirement", {
    method: "POST",
    body: JSON.stringify({ lines }),
  })
}

export function getPurchaseReception() {
  return request<{
    suppliers: { id: string; tradeName: string; paymentTerm?: string; creditDays?: number | null }[]
    lines: {
      productId: string
      name: string
      unit: string
      quantity: string
      unitCost: string
      presentationId: string
      trackLots?: boolean
      salePrice?: string
      presentations: { id: string; name: string; unitCost: string; salePrice?: string }[]
    }[]
  }>("/api/purchases/reception")
}

export function postPurchaseReception(input: {
  supplierId: string
  documentNumber?: string
  idempotencyKey: string
  /** false = queda pendiente de recepción (no suma stock). */
  receiveNow?: boolean
  payNow?: string
  payMethod?: "CASH" | "TRANSFER" | "OTHER"
  lines: { productId: string; presentationId?: string; quantity: string; unitCost: string; salePrice?: string; lotCode?: string; expiresAt?: string }[]
}) {
  return request<{ ok: true; id: string }>("/api/purchases/reception", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getBilling() {
  return request<{
    currency: string
    sales: { id: string; label: string }[]
    accepted: { id: string; label: string }[]
    documents: {
      id: string
      issuedAtLabel: string
      label: string
      customerName: string
      status: string
      statusLabel: string
      total: string
      saleId?: string | null
      attempts?: number
      lastError?: string
      hasCdr?: boolean
      hasPdf?: boolean
      docType?: string
    }[]
  }>("/api/billing")
}

export function issueBillingDocument(input: {
  saleId: string
  docType: string
  relatedId?: string
  buyerDocument?: string
  buyerName?: string
  buyerAddress?: string
}) {
  return request<{ ok: true; id: string; status: string }>("/api/billing/issue", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export type ReportTone = "teal" | "indigo" | "emerald" | "red" | "amber" | "violet" | "sky" | "rose" | "slate"

export type ReportData = {
  description: string
  chartTitle: string
  chartKind: "time" | "rank"
  chartMoney: boolean
  kpis: { label: string; value: string; tone: ReportTone; hint?: string }[]
  columns: string[]
  numeric: number[]
  rows: string[][]
  footer?: string[]
  chart: { label: string; value: number; text: string }[]
  empty: string
}

export function getReport(params: {
  area: string
  grupo: string
  desde?: string
  hasta?: string
}) {
  const query = new URLSearchParams({ area: params.area, grupo: params.grupo })
  if (params.desde) query.set("desde", params.desde)
  if (params.hasta) query.set("hasta", params.hasta)
  return request<ReportData>(`/api/reports?${query}`)
}

export function getSettings() {
  return request<{
    version: string
    versionLabel: string
    business: {
      name: string
      legalName: string
      taxId: string
      currency: string
      discountLimitPct: string
      allowCredit: boolean
    }
    branches: {
      id: string
      name: string
      current?: boolean
      warehouses: number
      registers: number
      warehouseList?: { id: string; name: string; isDefault: boolean; current: boolean }[]
      registerList?: { id: string; name: string }[]
    }[]
    users: { id: string; name: string; email: string; role: string }[]
    paymentMethods: { id: string; code: string; label: string; locked: boolean }[]
    hardwareReader: boolean
    theme: string
    themes: { id: string; label: string; panel: string; accent: string }[]
    logo: string | null
    cover: string | null
  }>("/api/settings")
}

export function saveSettingsTheme(theme: string) {
  return request<{ ok: true }>("/api/settings/theme", { method: "POST", body: JSON.stringify({ theme }) })
}

/** Sube logo o portada del negocio (binario ya reducido). */
export async function uploadSettingsImage(kind: "logo" | "cover", image: Blob) {
  let res: Response
  try {
    res = await fetch(`/api/settings/${kind}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": image.type || "image/jpeg" },
      body: image,
    })
  } catch {
    throw new OfflineError("Sin conexión: la imagen se sube cuando vuelva internet.")
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string | null; error?: string }
  if (!res.ok) {
    if (res.status === 413) throw new Error(kind === "logo" ? "El logo supera 2 MB" : "La portada supera 5 MB")
    throw new Error(data.error || `Error ${res.status}`)
  }
  return { url: data.url ?? null }
}

export function deleteSettingsImage(kind: "logo" | "cover") {
  return request<{ ok: true }>(`/api/settings/${kind}`, { method: "DELETE" })
}

export function getBranding(businessId?: string | null) {
  const query = businessId ? `?b=${encodeURIComponent(businessId)}` : ""
  return request<{ businessId: string | null; businessName: string | null; logo: string | null; cover: string | null }>(
    `/api/auth/branding${query}`,
  )
}

export function saveSettingsBusiness(input: {
  name: string
  legalName?: string
  taxId?: string
  currency: string
  discountLimitPct: string
  allowCredit: boolean
}) {
  return request<{ ok: true }>("/api/settings/business", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function createSettingsBranch(name: string, address?: string) {
  return request<{ ok: true; id: string }>("/api/settings/branches", {
    method: "POST",
    body: JSON.stringify({ name, address }),
  })
}

export function createSettingsPaymentMethod(label: string) {
  return request<{ ok: true }>("/api/settings/payment-methods", {
    method: "POST",
    body: JSON.stringify({ label }),
  })
}

export function deleteSettingsPaymentMethod(id: string) {
  return request<{ ok: true }>(`/api/settings/payment-methods/${id}`, { method: "DELETE" })
}

export function saveSettingsHardwareReader(enabled: boolean) {
  return request<{ ok: true }>("/api/settings/hardware-reader", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  })
}

// ---- Mermas y pérdidas ----

export type LossTypeInfo = { code: "SHRINKAGE" | "LOSS" | "INTERNAL"; label: string; causes: string[] }

export type LossRow = {
  id: string
  createdAtLabel: string
  type: string
  typeLabel: string
  cause: string
  productName: string
  productCode: string
  category: string
  quantityLabel: string
  baseQuantityLabel: string
  unitCost: string
  totalCost: string
  totalCostCents: number
  lotCode: string
  note: string
  userName: string
  warehouseName: string
  status: "ACTIVE" | "VOIDED"
  voidReason: string
  voidedAtLabel: string
}

type LossSum = { label: string; cost: string; costCents: number; count: number }

export function getLosses(params: { desde: string; hasta: string; tipo?: string }) {
  const query = new URLSearchParams({ desde: params.desde, hasta: params.hasta })
  if (params.tipo) query.set("tipo", params.tipo)
  return request<{
    currency: string
    warehouseName: string
    canRegister: boolean
    canVoid: boolean
    types: LossTypeInfo[]
    summary: {
      total: string
      totalCents: number
      count: number
      voided: number
      byType: (LossSum & { code: string })[]
      byCause: LossSum[]
      byProduct: LossSum[]
    }
    rows: LossRow[]
  }>(`/api/inventory/losses?${query}`)
}

export type LossProduct = {
  id: string
  name: string
  code: string
  unit: string
  stock: number
  stockLabel: string
  costPerBase: number
  trackLots: boolean
  barcodes: string[]
  imagePath: string | null
  categoryId: string | null
  brandId?: string | null
  presentations: { id: string; name: string; factor: number }[]
  lots: { code: string; quantityLabel: string; expiresAtLabel: string }[]
}

export function getLossForm() {
  return request<{ warehouseName: string; products: LossProduct[] }>("/api/inventory/losses/form")
}

export function registerLoss(input: {
  productId: string
  presentationId?: string
  quantity: string
  type: string
  cause: string
  note?: string
  lotCode?: string
}) {
  return request<{ ok: true; id: string; totalCost: string }>("/api/inventory/losses", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function voidLoss(id: string, reason: string) {
  return request<{ ok: true }>(`/api/inventory/losses/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  })
}

// ---- Usuarios y permisos ----

export type UserRow = {
  id: string
  name: string
  username: string
  role: string
  roleLabel: string
  registerId: string
  registerName: string
  mode: "role" | "custom"
  permissions: string[]
}

export function getUsers() {
  return request<{
    canManage: boolean
    currentUserId: string
    roles: { code: string; label: string }[]
    permissions: { code: string; label: string }[]
    registers: { id: string; name: string }[]
    roleMatrix: { role: string; label: string; permissions: string[] }[]
    users: UserRow[]
  }>("/api/settings/users")
}

export type UserInput = {
  name: string
  username: string
  password?: string
  role?: string
  registerId?: string
  mode: "role" | "custom"
  permissions?: string[]
}

export function createUser(input: UserInput) {
  return request<{ ok: true; id: string }>("/api/settings/users", { method: "POST", body: JSON.stringify(input) })
}

export function updateUser(id: string, input: UserInput) {
  return request<{ ok: true }>(`/api/settings/users/${id}`, { method: "PUT", body: JSON.stringify(input) })
}

export function deleteUser(id: string) {
  return request<{ ok: true }>(`/api/settings/users/${id}`, { method: "DELETE" })
}

export function saveRolePermissions(grants: string[]) {
  return request<{ ok: true; changes: number }>("/api/settings/role-permissions", {
    method: "POST",
    body: JSON.stringify({ grants }),
  })
}

// ---- Copias de seguridad ----

export type BackupRow = { name: string; kind: "auto" | "manual"; sizeLabel: string; createdAtLabel: string }

export function getBackups() {
  return request<{ canBackup: boolean; backups: BackupRow[] }>("/api/settings/backups")
}

export function createBackupNow() {
  return request<{ ok: true; name: string }>("/api/settings/backups", { method: "POST" })
}

export function backupDownloadUrl(name: string) {
  return `/api/settings/backups/${encodeURIComponent(name)}/download`
}


// ---- Cuentas por pagar y detalle de compra ----

export type PayableRow = {
  id: string
  createdAtLabel: string
  supplierName: string
  documentNumber: string
  status: string
  statusLabel: string
  total: string
  paid: string
  debt: string
  debtCents: number
  days: number
}

export function getPayables() {
  return request<{
    totalDebt: string
    totalDebtCents: number
    suppliers: { id: string; name: string; debt: string; debtCents: number; count: number; oldestLabel: string }[]
    payables: PayableRow[]
    pendingReception: PayableRow[]
  }>("/api/purchases/payables")
}

export function getPurchaseDetail(id: string) {
  return request<{
    id: string
    supplierName: string
    supplierTaxId: string
    documentNumber: string
    createdAtLabel: string
    receivedAtLabel: string
    warehouseName: string
    userName: string
    status: string
    statusLabel: string
    subtotal: string
    discount: string
    total: string
    paid: string
    debt: string
    debtCents: number
    debtAmount: string
    canReceive: boolean
    canPay: boolean
    lines: { id: string; description: string; quantityLabel: string; receivedLabel: string; fullyReceived: boolean; trackLots: boolean; unitCost: string; total: string }[]
    payments: { id: string; createdAtLabel: string; methodLabel: string; amount: string }[]
  }>(`/api/purchases/${id}`)
}

export function receivePurchaseNow(id: string, lots: Record<string, { lotCode?: string; expiresAt?: string }> = {}) {
  return request<{ ok: true }>(`/api/purchases/${id}/receive`, { method: "POST", body: JSON.stringify({ lots }) })
}

export function payPurchaseNow(id: string, amount: string, method: "CASH" | "TRANSFER" | "OTHER") {
  return request<{ ok: true }>(`/api/purchases/${id}/pay`, { method: "POST", body: JSON.stringify({ amount, method }) })
}

// ---- Entradas de inventario (sin compra) ----

export type EntryRow = {
  id: string
  createdAtLabel: string
  productName: string
  typeLabel: string
  reason: string
  quantityLabel: string
  balanceLabel: string
  lotCode: string
  userName: string
}

export function getEntries(params: { desde: string; hasta: string }) {
  return request<{
    warehouseName: string
    canRegister: boolean
    causes: string[]
    count: number
    byCause: { label: string; count: number }[]
    rows: EntryRow[]
  }>(`/api/inventory/entries?${new URLSearchParams(params)}`)
}

export function registerEntry(input: {
  productId: string
  presentationId?: string
  quantity: string
  cause: string
  note?: string
  lotCode?: string
  expiresAt?: string
}) {
  return request<{ ok: true; balanceLabel: string }>("/api/inventory/entries", { method: "POST", body: JSON.stringify(input) })
}

// ---- Sucursales, almacenes y cajas ----

export function switchPlace(branchId: string, warehouseId: string) {
  return request<{ ok: true; branchName: string; warehouseName: string }>("/api/auth/switch", {
    method: "POST",
    body: JSON.stringify({ branchId, warehouseId }),
  })
}

export function createRegisterApi(name: string) {
  return request<{ ok: true; id: string }>("/api/settings/registers", { method: "POST", body: JSON.stringify({ name }) })
}

export function deleteRegisterApi(id: string) {
  return request<{ ok: true }>(`/api/settings/registers/${id}`, { method: "DELETE" })
}

export function createWarehouseApi(name: string) {
  return request<{ ok: true; id: string }>("/api/settings/warehouses", { method: "POST", body: JSON.stringify({ name }) })
}

export function deleteWarehouseApi(id: string) {
  return request<{ ok: true }>(`/api/settings/warehouses/${id}`, { method: "DELETE" })
}

// ---- Categorías, marcas e importación ----

export type TaxonomyItem = { id: string; name: string; products: number }

export function getTaxonomy() {
  return request<{ writable: boolean; categories: TaxonomyItem[]; brands: TaxonomyItem[] }>("/api/catalog/taxonomy")
}

export function createTaxonomy(kind: "categories" | "brands", name: string) {
  return request<{ ok: true }>(`/api/catalog/${kind}`, { method: "POST", body: JSON.stringify({ name }) })
}

export function renameTaxonomy(kind: "categories" | "brands", id: string, name: string) {
  return request<{ ok: true }>(`/api/catalog/${kind}/${id}`, { method: "PUT", body: JSON.stringify({ name }) })
}

export function deleteTaxonomy(kind: "categories" | "brands", id: string) {
  return request<{ ok: true }>(`/api/catalog/${kind}/${id}`, { method: "DELETE" })
}

export function importCatalog(csv: string, dryRun: boolean) {
  return request<{ created: number; updated: number; errors: string[] }>("/api/catalog/import", {
    method: "POST",
    body: JSON.stringify({ csv, dryRun }),
  })
}

// ---- Consulta DNI / RUC ----

export function lookupDocument(numero: string) {
  return request<{ docType: "1" | "6"; document: string; name: string; address: string }>(
    `/api/lookup/document?numero=${encodeURIComponent(numero)}`,
  )
}


// ---- Facturación: configuración, envío y descargas ----

export type BillingConfig = {
  businessName: string
  taxId: string
  taxIdValid: boolean
  endpoint: string
  environment: string
  igvRate: string
  hasToken: boolean
  assistantReady: boolean
  configured: boolean
  series: { docType: string; label: string; series: string; nextNumber: number; locked: boolean }[]
}

export function getBillingConfig() {
  return request<BillingConfig>("/api/billing/config")
}

export function saveBillingConfig(input: { endpoint: string; token?: string; environment: string; igvRate: string }) {
  return request<{ ok: true }>("/api/billing/config", { method: "POST", body: JSON.stringify(input) })
}

export function saveBillingSeries(docType: string, series: string) {
  return request<{ ok: true }>("/api/billing/series", { method: "POST", body: JSON.stringify({ docType, series }) })
}

export function sendBillingDocument(id: string) {
  return request<{ ok: true; status: string; statusLabel: string }>(`/api/billing/${id}/send`, { method: "POST" })
}

// ---- Toma de inventario (conteo físico) ----
export type MeasureOption = { id: string; name: string; factor: number }

export type CountSummaryRow = {
  id: string
  number: number
  mode?: string
  modeLabel?: string
  status: "OPEN" | "CLOSED" | "CANCELLED"
  statusLabel: string
  warehouseName: string
  scope: string
  userName: string
  createdAtLabel: string
  closedAtLabel: string
  products: number
  countedItems: number
  diffItems: number
  shortage: string
  surplus: string
  net: string
  netCents: number
}

export type CountLine = {
  productId: string
  name: string
  code: string
  category: string
  unit: string
  barcodes: string[]
  trackLots: boolean
  measures: MeasureOption[]
  system: number
  counted: number | null
  costPerUnit: number
  diffLabel: string
  diffValue: string
  diffValueCents: number
}

export type CountDetail = {
  id: string
  number: number
  mode?: string
  modeLabel?: string
  status: "OPEN" | "CLOSED" | "CANCELLED"
  statusLabel: string
  warehouseName: string
  sameWarehouse: boolean
  scope: string
  note: string
  userName: string
  createdAtLabel: string
  closedAtLabel: string
  canManage: boolean
  currency: string
  summary: { countedItems: number; diffItems: number; shortage: string; surplus: string; net: string; systemValue: string; countedValue: string }
  lines: CountLine[]
}

export function getCounts() {
  return request<{
    warehouseName: string
    canManage: boolean
    categories: { id: string; name: string }[]
    brands?: { id: string; name: string }[]
    openId: string | null
    counts: CountSummaryRow[]
  }>("/api/inventory/counts")
}

export function createCount(input: { categoryId?: string; brandId?: string; note?: string; mode?: string }) {
  return request<{ ok: true; id: string }>("/api/inventory/counts", { method: "POST", body: JSON.stringify(input) })
}

export function getCount(id: string) {
  return request<CountDetail>(`/api/inventory/counts/${id}`)
}

export function saveCountLines(id: string, lines: { productId: string; quantity: string; measureId?: string }[]) {
  return request<{ ok: true; saved: number }>(`/api/inventory/counts/${id}/lines`, { method: "PUT", body: JSON.stringify({ lines }) })
}

export function closeCount(id: string, uncounted: "KEEP" | "ZERO") {
  return request<{ ok: true; id: string; diffItems: number }>(`/api/inventory/counts/${id}/close`, { method: "POST", body: JSON.stringify({ uncounted }) })
}

export function cancelCount(id: string) {
  return request<{ ok: true }>(`/api/inventory/counts/${id}/cancel`, { method: "POST" })
}

// ---- Asistente local (Fadey Impresión): ticketera y SUNAT ----
export type AssistantBilling = {
  tradeName: string
  address: string
  ubigeo: string
  department: string
  province: string
  district: string
  phone: string
  email: string
  solUser: string
  hasSolPassword: boolean
  certName: string
  hasCertPassword: boolean
  ready: boolean
}

export function getAssistantBilling() {
  return request<AssistantBilling>("/api/assistant/billing")
}

export function saveAssistantBilling(input: Record<string, string>) {
  return request<{ ok: true; ready: boolean }>("/api/assistant/billing", { method: "POST", body: JSON.stringify(input) })
}

export function getDocumentTicket(id: string, width: number) {
  return request<{ text: string; brand: string; logo: string | null; qr: string; accepted: boolean; saleId: string }>(
    `/api/billing/${id}/ticket?width=${width}`,
  )
}

export function prepareAssistantEmit(id: string) {
  return request<{ ok: true; sale: unknown }>(`/api/billing/${id}/assistant/prepare`, { method: "POST" })
}

export function saveAssistantEmitResult(id: string, result: unknown) {
  return request<{ ok: true; status: string; error: string }>(`/api/billing/${id}/assistant/result`, {
    method: "POST",
    body: JSON.stringify(result),
  })
}

export function releaseAssistantEmit(id: string, reason: string) {
  return request<{ ok: true }>(`/api/billing/${id}/assistant/release`, { method: "POST", body: JSON.stringify({ reason }) })
}

export function wipeAllData(password: string) {
  return request<{ ok: true }>("/api/settings/wipe", { method: "POST", body: JSON.stringify({ password, confirm: true }) })
}

// ---- Requerimiento con opciones (qué pedir, marcas y búsqueda manual) ----
export type RequirementItem = { productId: string; name: string; brand: string; unit: string; stock: string; quantity: string; reason?: string }

export function getRequirementSetup() {
  return request<{
    warehouseName: string
    brands: { id: string; name: string }[]
    catalog: { productId: string; name: string; code: string; barcodes: string[]; brand: string; unit: string; stock: string }[]
    current: { id: string; createdAtLabel: string; userName: string; lines: RequirementItem[] } | null
  }>("/api/purchases/requirement/setup")
}

export function getRequirementSuggestions(input: { origen: string[]; marcas: string[]; desde?: string; hasta?: string }) {
  const params = new URLSearchParams()
  params.set("origen", input.origen.join(","))
  if (input.marcas.length) params.set("marcas", input.marcas.join(","))
  if (input.desde) params.set("desde", input.desde)
  if (input.hasta) params.set("hasta", input.hasta)
  return request<{ products: RequirementItem[] }>(`/api/purchases/requirement/suggestions?${params.toString()}`)
}

export function cancelPurchaseRequirement() {
  return request<{ ok: true }>("/api/purchases/requirement/cancel", { method: "POST" })
}
