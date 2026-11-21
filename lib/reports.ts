import { prisma } from "@/lib/db"
import { D, QTY_SCALE } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

export type ReportRange = { from: Date; to: Date }

export function parseRange(from?: string, to?: string): ReportRange {
  const end = to ? new Date(`${to}T23:59:59`) : new Date()
  const start = from ? new Date(`${from}T00:00:00`) : new Date(end.getFullYear(), end.getMonth(), 1)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const now = new Date()
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
  }
  return { from: start, to: end }
}

function lineCost(costPrice: number, baseQuantity: number) {
  return D(costPrice).mul(baseQuantity).div(QTY_SCALE).toDecimalPlaces(0).toNumber()
}

export type SalesFilter = { branchId?: string; userId?: string }

export async function salesReport(ctx: TenantContext, range: ReportRange, filter: SalesFilter = {}) {
  assertCan(ctx, "reports")
  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({
      where: {
        businessId: ctx.businessId,
        status: "COMPLETED",
        createdAt: { gte: range.from, lte: range.to },
        ...(filter.branchId ? { branchId: filter.branchId } : {}),
        ...(filter.userId ? { userId: filter.userId } : {}),
      },
      include: { user: true, customer: true, lines: { include: { product: { include: { category: true, brand: true } } } }, payments: true },
    }),
    prisma.saleReturn.findMany({
      where: {
        businessId: ctx.businessId,
        createdAt: { gte: range.from, lte: range.to },
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.branchId ? { sale: { branchId: filter.branchId } } : {}),
      },
      include: {
        user: true,
        sale: { include: { customer: true } },
        lines: { include: { saleLine: { include: { product: { include: { category: true, brand: true } } } } } },
      },
    }),
  ])
  const byDay = new Map<string, { total: number; cost: number }>()
  const byUser = new Map<string, number>()
  // Por producto + presentación (no por el texto guardado en la línea): si el producto
  // cambió de nombre, sus ventas siguen sumando en una sola fila con el nombre actual.
  const byProduct = new Map<string, { name: string; qty: number; total: number; cost: number }>()
  const productKey = (productId: string, productName: string, description: string) => {
    const parts = description.split(" · ")
    const presentation = parts.length > 1 ? parts.slice(1).join(" · ") : ""
    return {
      key: `${productId}|${presentation.toLowerCase()}`,
      name: presentation ? `${productName} · ${presentation}` : productName,
    }
  }
  const byCategory = new Map<string, { total: number; cost: number }>()
  const byMethod = new Map<string, number>()
  const byCustomer = new Map<string, { name: string; count: number; total: number }>()
  let total = 0
  let cost = 0
  const addDay = (day: string, amount: number, lineCostValue = 0) => {
    const row = byDay.get(day) ?? { total: 0, cost: 0 }
    row.total += amount
    row.cost += lineCostValue
    byDay.set(day, row)
  }
  for (const sale of sales) {
    total += sale.total
    const day = sale.createdAt.toLocaleDateString("en-CA")
    addDay(day, sale.total)
    byUser.set(sale.user.name, (byUser.get(sale.user.name) ?? 0) + sale.total)
    const customerKey = sale.customerId ?? "publico"
    const customer = byCustomer.get(customerKey) ?? { name: sale.customer?.name ?? "Público", count: 0, total: 0 }
    customer.count += 1
    customer.total += sale.total
    byCustomer.set(customerKey, customer)
    for (const payment of sale.payments) byMethod.set(payment.method, (byMethod.get(payment.method) ?? 0) + payment.amount)
    // El descuento de la venta se reparte entre sus líneas en proporción a su importe,
    // para que la suma por producto/categoría coincida con el total vendido.
    const lineSum = sale.lines.reduce((sum, line) => sum + line.total, 0)
    let allocated = 0
    sale.lines.forEach((line, index) => {
      const last = index === sale.lines.length - 1
      const net = lineSum > 0 ? (last ? sale.total - allocated : Math.round((line.total * sale.total) / lineSum)) : line.total
      allocated += net
      ;(line as { netTotal?: number }).netTotal = net
    })
    for (const line of sale.lines) {
      const lineNet = (line as { netTotal?: number }).netTotal ?? line.total
      const priced = lineCost(line.costPrice, line.baseQuantity)
      const id = productKey(line.productId, line.product.name, line.description)
      const row = byProduct.get(id.key) ?? { name: id.name, qty: 0, total: 0, cost: 0 }
      row.qty += line.quantity
      row.total += lineNet
      row.cost += priced
      byProduct.set(id.key, row)
      cost += priced
      addDay(day, 0, priced)
      // El sistema trabaja por marca: «byCategory» agrupa por marca.
      const category = line.product.brand?.name ?? "Sin marca"
      const cat = byCategory.get(category) ?? { total: 0, cost: 0 }
      cat.total += lineNet
      cat.cost += priced
      byCategory.set(category, cat)
    }
  }
  for (const entry of returns) {
    total -= entry.total
    const day = entry.createdAt.toLocaleDateString("en-CA")
    addDay(day, -entry.total)
    byUser.set(entry.user.name, (byUser.get(entry.user.name) ?? 0) - entry.total)
    const customerKey = entry.sale.customerId ?? "publico"
    const customer = byCustomer.get(customerKey) ?? { name: entry.sale.customer?.name ?? "Público", count: 0, total: 0 }
    customer.total -= entry.total
    byCustomer.set(customerKey, customer)
    const method = entry.sale.saleType === "CREDIT" ? "CREDIT" : entry.refundMethod
    byMethod.set(method, (byMethod.get(method) ?? 0) - entry.total)
    for (const line of entry.lines) {
      const id = productKey(line.saleLine.productId, line.saleLine.product.name, line.saleLine.description)
      const row = byProduct.get(id.key) ?? { name: id.name, qty: 0, total: 0, cost: 0 }
      const returnedCost = lineCost(line.saleLine.costPrice, line.baseQuantity)
      row.qty -= line.quantity
      row.total -= line.total
      row.cost -= returnedCost
      byProduct.set(id.key, row)
      cost -= returnedCost
      addDay(day, 0, -returnedCost)
      const category = line.saleLine.product.brand?.name ?? "Sin marca"
      const cat = byCategory.get(category) ?? { total: 0, cost: 0 }
      cat.total -= line.total
      cat.cost -= returnedCost
      byCategory.set(category, cat)
    }
  }
  return {
    count: sales.length,
    total,
    cost,
    gross: total - cost,
    ticket: sales.length ? Math.round(total / sales.length) : 0,
    byDay: [...byDay.entries()],
    byUser: [...byUser.entries()],
    byProduct: [...byProduct.values()].map(({ name, ...row }) => [name, row] as [string, { qty: number; total: number; cost: number }]),
    byCategory: [...byCategory.entries()],
    // Sin medios que quedaron en 0 (por ejemplo, una venta a crédito devuelta completa).
    byMethod: [...byMethod.entries()].filter(([, value]) => value !== 0),
    byCustomer: [...byCustomer.entries()],
  }
}

export async function purchasesReport(ctx: TenantContext, range: ReportRange, filter: { userId?: string } = {}) {
  assertCan(ctx, "reports")
  const purchases = await prisma.purchase.findMany({
    where: {
      businessId: ctx.businessId,
      status: { not: "CANCELLED" },
      createdAt: { gte: range.from, lte: range.to },
      ...(filter.userId ? { userId: filter.userId } : {}),
    },
    include: { supplier: true, lines: true },
  })
  const bySupplier = new Map<string, number>()
  const byProduct = new Map<string, number>()
  const byDay = new Map<string, number>()
  let total = 0
  let paid = 0
  for (const purchase of purchases) {
    total += purchase.total
    paid += purchase.paid
    const day = purchase.createdAt.toLocaleDateString("en-CA")
    byDay.set(day, (byDay.get(day) ?? 0) + purchase.total)
    bySupplier.set(purchase.supplier.tradeName, (bySupplier.get(purchase.supplier.tradeName) ?? 0) + purchase.total)
    for (const line of purchase.lines) byProduct.set(line.description, (byProduct.get(line.description) ?? 0) + line.total)
  }
  return {
    count: purchases.length,
    total,
    paid,
    payable: total - paid,
    suppliers: bySupplier.size,
    bySupplier: [...bySupplier.entries()],
    byProduct: [...byProduct.entries()],
    byDay: [...byDay.entries()],
    documents: purchases.map((purchase) => ({
      id: purchase.id,
      date: purchase.createdAt,
      supplier: purchase.supplier.tradeName,
      number: purchase.documentNumber ?? "—",
      total: purchase.total,
      paid: purchase.paid,
      status: purchase.status,
    })),
  }
}

export async function inventoryReport(ctx: TenantContext) {
  assertCan(ctx, "reports")
  const balances = await prisma.stockBalance.findMany({
    where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId },
    include: { product: true },
  })
  const lots = await prisma.lot.findMany({
    where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId, quantity: { gt: 0 } },
    include: { product: true },
    orderBy: { expiresAt: "asc" },
  })
  let value = 0
  const rows = balances.map((balance) => {
    const line = lineCost(balance.product.costPrice, balance.quantity)
    value += line
    return {
      name: balance.product.name,
      quantity: balance.quantity,
      min: balance.product.minStock,
      value: line,
      state: balance.quantity <= 0 ? "Agotado" : balance.quantity <= balance.product.minStock ? "Bajo" : "Disponible",
    }
  })
  return {
    value,
    low: rows.filter((row) => row.state === "Bajo"),
    empty: rows.filter((row) => row.state === "Agotado"),
    rows,
    expiries: lots.filter((lot) => lot.expiresAt).map((lot) => ({ name: lot.product.name, code: lot.code, expiresAt: lot.expiresAt, quantity: lot.quantity })),
  }
}

export async function financeReport(ctx: TenantContext, range: ReportRange) {
  assertCan(ctx, "reports")
  const sales = await salesReport(ctx, range)
  const purchases = await purchasesReport(ctx, range)
  const movements = await prisma.cashMovement.findMany({
    where: { businessId: ctx.businessId, createdAt: { gte: range.from, lte: range.to } },
  })
  const cashIn = movements.filter((item) => item.type === "INCOME" || item.type === "DEPOSIT").reduce((sum, item) => sum + item.amount, 0)
  const cashOut = movements.filter((item) => item.type === "EXPENSE" || item.type === "WITHDRAWAL").reduce((sum, item) => sum + item.amount, 0)
  const refundCash = movements
    .filter((item) => item.type === "EXPENSE" && item.reason.startsWith("Devolución"))
    .reduce((sum, item) => sum + item.amount, 0)
  const cashSales = sales.byMethod.find((item) => item[0] === "CASH")?.[1] ?? 0
  const receivable = await prisma.customer.aggregate({ where: { businessId: ctx.businessId }, _sum: { balance: true } })
  return {
    sales: sales.total,
    cashSales,
    cashIn,
    cashOut,
    gross: sales.gross,
    operatingExpense: cashOut,
    net: sales.gross - (cashOut - refundCash),
    receivable: receivable._sum.balance ?? 0,
    payable: purchases.payable,
  }
}

const IN_TYPES = new Set(["ENTRY", "PURCHASE", "RETURN", "LOSS_VOID"])
const OUT_TYPES = new Set(["SALE", "SHRINKAGE", "LOSS", "INTERNAL", "SALE_VOID"])
const TRANSFER_TYPES = new Set(["TRANSFER_IN", "TRANSFER_OUT"])

export async function inventoryMovements(ctx: TenantContext, range: ReportRange) {
  assertCan(ctx, "reports")
  const movements = await prisma.stockMovement.findMany({
    where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId, createdAt: { gte: range.from, lte: range.to } },
    include: { product: true, user: true },
    orderBy: { createdAt: "desc" },
  })
  const pick = (types: Set<string>) => movements.filter((item) => types.has(item.type))
  return {
    entries: pick(IN_TYPES),
    exits: pick(OUT_TYPES),
    transfers: pick(TRANSFER_TYPES),
    adjustments: movements.filter((item) => item.type === "ADJUST"),
  }
}

export async function cashReport(ctx: TenantContext, range: ReportRange, filter: SalesFilter = {}) {
  assertCan(ctx, "reports")
  const sales = await salesReport(ctx, range, filter)
  const [movements, opened, closed] = await Promise.all([
    prisma.cashMovement.findMany({
      where: {
        businessId: ctx.businessId,
        createdAt: { gte: range.from, lte: range.to },
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.branchId ? { session: { branchId: filter.branchId } } : {}),
      },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cashSession.findMany({
      where: {
        businessId: ctx.businessId,
        openedAt: { gte: range.from, lte: range.to },
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.branchId ? { branchId: filter.branchId } : {}),
      },
      include: { register: true, user: true },
      orderBy: { openedAt: "desc" },
    }),
    prisma.cashSession.findMany({
      where: {
        businessId: ctx.businessId,
        status: "CLOSED",
        closedAt: { gte: range.from, lte: range.to },
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.branchId ? { branchId: filter.branchId } : {}),
      },
      include: { register: true, user: true },
      orderBy: { closedAt: "desc" },
    }),
  ])
  const cashIn = movements.filter((item) => item.type === "INCOME" || item.type === "DEPOSIT").reduce((sum, item) => sum + item.amount, 0)
  const cashOut = movements.filter((item) => item.type === "EXPENSE" || item.type === "WITHDRAWAL").reduce((sum, item) => sum + item.amount, 0)
  return { sales: sales.byMethod, cashIn, cashOut, movements, opened, closed }
}

export async function customerReport(ctx: TenantContext, range: ReportRange, filter: SalesFilter = {}) {
  assertCan(ctx, "reports")
  const [sales, customers] = await Promise.all([
    salesReport(ctx, range, filter),
    prisma.customer.findMany({ where: { businessId: ctx.businessId, isActive: true }, orderBy: { name: "asc" } }),
  ])
  const buyers = sales.byCustomer.filter((item) => item[0] !== "publico" && item[1].count > 0)
  const credits = customers.filter((customer) => customer.balance > 0)
  return {
    totalCustomers: customers.length,
    buyers: buyers.length,
    frequent: buyers.filter((item) => item[1].count > 1),
    purchases: sales.byCustomer,
    credits,
    receivable: credits.reduce((sum, customer) => sum + customer.balance, 0),
  }
}
