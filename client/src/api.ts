export type ApiError = { error: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  const data = (await res.json().catch(() => ({}))) as T & ApiError
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`)
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

export type PanelBootstrap = {
  user: { id: string; name: string; role: string; configMode: boolean }
  business: { id: string; name: string; currency: string }
  branch: { id: string; name: string }
  warehouse: { id: string; name: string }
  nav: { title: string; items: { href: string; label: string }[] }[]
  permissions: { cash: boolean; cashClose: boolean; sell: boolean }
}

export function getPanelBootstrap() {
  return request<PanelBootstrap>("/api/panel/bootstrap")
}

export type MoneyOut = { cents: number; label: string; amount: string }

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
}

export function getClosePreview() {
  return request<ClosePreview>("/api/cash/close-preview")
}

export function closeCash(input: {
  counted: string
  notes?: string
  arqueoDetail?: string
  denominations?: Record<string, string>
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
}

export function getSaleStatus() {
  return request<{
    currency: string
    cashOpen: boolean
    registerName: string | null
    discountLimitPct: number
    methods: { code: string; label: string }[]
  }>("/api/sales/status")
}

export function searchSaleProducts(q: string) {
  return request<{ currency: string; products: SaleProduct[] }>(
    `/api/sales/products?q=${encodeURIComponent(q)}`,
  )
}

export function confirmSale(input: {
  idempotencyKey: string
  discount?: string
  notes?: string
  lines: { productId: string; presentationId: string; quantity: string }[]
  payments: { method: string; amount: string; reference?: string }[]
}) {
  return request<{ ok: true; saleId: string; total: string; totalAmount: string }>("/api/sales/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getSaleTicket(saleId: string) {
  return request<{
    saleId: string
    code: string
    currency: string
    subtotal: string
    discount: string
    total: string
    text: string
    lines: { description: string; quantityLabel: string; unitPrice: string; total: string }[]
    payments: { label: string; amount: string }[]
  }>(`/api/sales/${saleId}/ticket`)
}

export function getSalesHistory(status?: "VOIDED") {
  const q = status ? `?status=${status}` : ""
  return request<{
    currency: string
    canVoid: boolean
    sales: {
      id: string
      code: string
      status: string
      statusLabel: string
      createdAtLabel: string
      customerName: string
      userName: string
      total: string
      payments: string
    }[]
  }>(`/api/sales/history${q}`)
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

export function getCatalog() {
  return request<{
    currency: string
    writable: boolean
    categories: { id: string; name: string }[]
    products: {
      id: string
      code: string | null
      name: string
      categoryId: string | null
      categoryName: string | null
      brandName: string | null
      price: string
      stock: string
      active: boolean
    }[]
  }>("/api/catalog")
}
