import { prisma } from "@/lib/db"
import { formatQty } from "@/lib/money"
import type { TenantContext } from "@/lib/types"
export { APP_VERSION } from "@/lib/version"

export type NoticeKind = "out" | "low" | "expiry"

export type SystemNotice = {
  id: string
  kind: NoticeKind
  title: string
  detail: string
  href: string
}

const DAY = 24 * 60 * 60 * 1000

function startOfDay(date: Date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function expiryLabel(expiresAt: Date) {
  const days = Math.round((startOfDay(expiresAt).getTime() - startOfDay(new Date()).getTime()) / DAY)
  if (days < 0) return days === -1 ? "Vencido hace 1 día" : `Vencido hace ${-days} días`
  if (days === 0) return "Vence hoy"
  if (days === 1) return "Vence mañana"
  return `Vence en ${days} días`
}

export async function listNotices(ctx: TenantContext): Promise<SystemNotice[]> {
  const horizon = startOfDay(new Date())
  horizon.setDate(horizon.getDate() + 15)
  horizon.setHours(23, 59, 59, 999)
  const [products, balances, lots] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: ctx.businessId, isActive: true, variants: { none: { isActive: true } } },
      select: { id: true, name: true, minStock: true, baseUnit: { select: { symbol: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.stockBalance.findMany({
      where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId },
      select: { productId: true, quantity: true },
    }),
    prisma.lot.findMany({
      where: {
        businessId: ctx.businessId,
        warehouseId: ctx.warehouseId,
        quantity: { gt: 0 },
        expiresAt: { lte: horizon },
      },
      include: { product: { select: { name: true } } },
      orderBy: { expiresAt: "asc" },
    }),
  ])
  const stock = new Map(balances.map((row) => [row.productId, row.quantity]))
  const notices: SystemNotice[] = []
  for (const lot of lots) {
    if (!lot.expiresAt) continue
    notices.push({
      id: `lot-${lot.id}`,
      kind: "expiry",
      title: lot.product.name,
      detail: `Lote ${lot.code} · ${expiryLabel(lot.expiresAt)}`,
      href: "/inventario/alertas",
    })
  }
  for (const product of products) {
    const quantity = stock.get(product.id) ?? 0
    const low = quantity <= 0 || (product.minStock > 0 && quantity <= product.minStock)
    if (!low) continue
    const amount = `${formatQty(quantity)} ${product.baseUnit.symbol}`
    notices.push({
      id: `stock-${product.id}`,
      kind: quantity <= 0 ? "out" : "low",
      title: product.name,
      detail: quantity <= 0 ? `Agotado · ${amount}` : `Stock bajo · ${amount} · mínimo ${formatQty(product.minStock)}`,
      href: "/inventario/alertas",
    })
  }
  return notices
}
