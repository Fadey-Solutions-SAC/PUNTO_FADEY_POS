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

export async function listNotices(ctx: TenantContext): Promise<SystemNotice[]> {
  // Sin lotes ni vencimientos: los avisos son solo de stock bajo o agotado.
  const [products, balances] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: ctx.businessId, isActive: true, variants: { none: { isActive: true } } },
      select: { id: true, name: true, minStock: true, baseUnit: { select: { symbol: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.stockBalance.findMany({
      where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId },
      select: { productId: true, quantity: true },
    }),
  ])
  const stock = new Map(balances.map((row) => [row.productId, row.quantity]))
  const notices: SystemNotice[] = []
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
