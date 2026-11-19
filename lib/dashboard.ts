import { prisma } from "@/lib/db"
import { mulScale } from "@/lib/money"
import type { TenantContext } from "@/lib/types"

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

export async function dashboardData(ctx: TenantContext) {
  const today = startOfToday()
  const week = new Date(today)
  week.setDate(week.getDate() - 6)

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const [salesToday, salesYesterday, movementsToday, products, balances, lastSales, openSessions, weekSales, weekReturns, lastPurchases] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: today } },
      include: { lines: true, payments: true },
    }),
    prisma.sale.findMany({
      where: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: yesterday, lt: today } },
      select: { total: true },
    }),
    prisma.cashMovement.findMany({
      where: { businessId: ctx.businessId, createdAt: { gte: today } },
    }),
    prisma.product.count({ where: { businessId: ctx.businessId, isActive: true, parentId: null } }),
    prisma.stockBalance.findMany({
      where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId },
      include: { product: true },
    }),
    prisma.sale.findMany({
      where: { businessId: ctx.businessId, status: "COMPLETED" },
      include: { user: true, customer: true, payments: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.cashSession.findMany({
      where: { businessId: ctx.businessId, status: "OPEN" },
      include: { register: true, user: true },
    }),
    prisma.sale.findMany({
      where: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: week } },
      select: { total: true, createdAt: true },
    }),
    prisma.saleReturn.findMany({
      where: { businessId: ctx.businessId, createdAt: { gte: week } },
      select: { total: true, createdAt: true, lines: { select: { baseQuantity: true, saleLine: { select: { costPrice: true } } } } },
    }),
    prisma.purchase.findMany({
      where: { businessId: ctx.businessId },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ])

  const returnsToday = weekReturns.filter((item) => item.createdAt >= today)
  const returnTotal = returnsToday.reduce((sum, item) => sum + item.total, 0)
  const returnCost = returnsToday.reduce(
    (sum, item) => sum + item.lines.reduce((lineSum, line) => lineSum + mulScale(line.saleLine.costPrice, line.baseQuantity), 0),
    0,
  )
  const salesTotal = salesToday.reduce((sum, sale) => sum + sale.total, 0) - returnTotal
  const profit = salesToday.reduce((sum, sale) => {
    const cost = sale.lines.reduce((lineSum, line) => lineSum + mulScale(line.costPrice, line.baseQuantity), 0)
    return sum + sale.total - cost
  }, 0) - (returnTotal - returnCost)
  const income = movementsToday.filter((item) => item.type === "INCOME" || item.type === "DEPOSIT").reduce((sum, item) => sum + item.amount, 0)
  const expense = movementsToday.filter((item) => item.type === "EXPENSE" || item.type === "WITHDRAWAL").reduce((sum, item) => sum + item.amount, 0)

  const activeProducts = await prisma.product.findMany({
    where: { businessId: ctx.businessId, isActive: true },
    select: { id: true, name: true, minStock: true },
  })
  const stockByProduct = new Map(balances.map((row) => [row.productId, row.quantity]))
  let low = 0
  let empty = 0
  const attention: { name: string; quantity: number; minStock: number }[] = []
  for (const product of activeProducts) {
    const quantity = stockByProduct.get(product.id) ?? 0
    if (quantity <= 0) empty += 1
    else if (product.minStock > 0 && quantity <= product.minStock) low += 1
    if (quantity <= 0 || (product.minStock > 0 && quantity <= product.minStock)) {
      attention.push({ name: product.name, quantity, minStock: product.minStock })
    }
  }
  attention.sort((a, b) => a.quantity - b.quantity)

  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(week)
    date.setDate(week.getDate() + index)
    const key = dayKey(date)
    const sold = weekSales.filter((sale) => dayKey(sale.createdAt) === key).reduce((sum, sale) => sum + sale.total, 0)
    const returned = weekReturns.filter((item) => dayKey(item.createdAt) === key).reduce((sum, item) => sum + item.total, 0)
    const total = sold - returned
    return { label: date.toLocaleDateString("es-PE", { weekday: "short" }), total }
  })

  const returnsYesterday = weekReturns.filter((item) => item.createdAt >= yesterday && item.createdAt < today)
  const yesterdaySales = salesYesterday.reduce((sum, sale) => sum + sale.total, 0) - returnsYesterday.reduce((sum, item) => sum + item.total, 0)
  const payMix: Record<string, number> = { CASH: 0, CARD: 0, TRANSFER: 0, OTHER: 0, CREDIT: 0 }
  for (const sale of salesToday) {
    for (const payment of sale.payments) {
      payMix[payment.method] = (payMix[payment.method] ?? 0) + payment.amount
    }
  }

  return {
    salesTotal,
    operations: salesToday.length,
    yesterdaySales,
    yesterdayOperations: salesYesterday.length,
    income,
    expense,
    profit,
    payMix,
    openSessions,
    products,
    low,
    empty,
    attention: attention.slice(0, 5),
    lastSales,
    lastPurchases,
    days,
  }
}

export async function stockAlertCount(ctx: TenantContext) {
  const [products, balances] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: ctx.businessId, isActive: true },
      select: { id: true, minStock: true },
    }),
    prisma.stockBalance.findMany({
      where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId },
      select: { productId: true, quantity: true },
    }),
  ])
  const stock = new Map(balances.map((row) => [row.productId, row.quantity]))
  let count = 0
  for (const product of products) {
    const quantity = stock.get(product.id) ?? 0
    if (quantity <= 0 || (product.minStock > 0 && quantity <= product.minStock)) count += 1
  }
  return count
}
