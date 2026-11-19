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
    warehouses: {
      id: string
      name: string
      branch: string
      isDefault: boolean
      inUse: boolean
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
  lines: { productId: string; quantity: string }[]
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
    }[]
  }>("/api/inventory/adjustments")
}

export function postInventoryAdjustment(input: {
  productId: string
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
    suppliers: { id: string; tradeName: string }[]
    lines: {
      productId: string
      name: string
      unit: string
      quantity: string
      unitCost: string
      presentationId: string
      presentations: { id: string; name: string; unitCost: string }[]
    }[]
  }>("/api/purchases/reception")
}

export function postPurchaseReception(input: {
  supplierId: string
  documentNumber?: string
  idempotencyKey: string
  lines: { productId: string; presentationId?: string; quantity: string; unitCost: string }[]
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
    }[]
  }>("/api/billing")
}

export function issueBillingDocument(input: { saleId: string; docType: string; relatedId?: string }) {
  return request<{ ok: true; id: string }>("/api/billing/issue", {
    method: "POST",
    body: JSON.stringify(input),
  })
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
  return request<{
    description: string
    chartTitle: string
    kpis: { label: string; value: string }[]
    columns: string[]
    rows: string[][]
    chart: { label: string; value: number; text: string }[]
  }>(`/api/reports?${query}`)
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
    branches: { id: string; name: string; warehouses: number; registers: number }[]
    users: { id: string; name: string; email: string; role: string }[]
    paymentMethods: { id: string; code: string; label: string; locked: boolean }[]
    hardwareReader: boolean
  }>("/api/settings")
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
