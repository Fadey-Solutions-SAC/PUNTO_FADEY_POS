import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { fromMoneyInt, fromQtyInt, formatQty, QTY_SCALE, toQtyInt } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"
import { randomUUID } from "node:crypto"

export type RequirementProduct = {
  productId: string
  name: string
  categoryName: string | null
  unit: string
  stock: string
  minStock: string
  maxStock: string | null
  quantity: string
}

export type ReceptionLine = {
  productId: string
  name: string
  unit: string
  quantity: string
  unitCost: string
  presentationId: string
  presentations: { id: string; name: string; unitCost: string }[]
}

function isLow(stock: number, minStock: number) {
  return stock <= 0 || (minStock > 0 && stock <= minStock)
}

export async function lowStockRequirement(ctx: TenantContext): Promise<RequirementProduct[]> {
  assertCan(ctx, "purchases")
  const [products, saved] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: ctx.businessId, isActive: true, variants: { none: { isActive: true } } },
      include: {
        category: true,
        baseUnit: true,
        balances: { where: { warehouseId: ctx.warehouseId } },
      },
      orderBy: { name: "asc" },
    }),
    openQuantities(ctx),
  ])
  return products.flatMap((product) => {
    const stock = product.balances[0]?.quantity ?? 0
    if (!isLow(stock, product.minStock)) return []
    const gap = product.maxStock != null && product.maxStock > stock ? product.maxStock - stock : null
    const savedQty = saved.get(product.id)
    return [{
      productId: product.id,
      name: product.name,
      categoryName: product.category?.name ?? null,
      unit: product.baseUnit.symbol,
      stock: formatQty(stock),
      minStock: formatQty(product.minStock),
      maxStock: product.maxStock == null ? null : formatQty(product.maxStock),
      quantity: savedQty != null ? formatQty(savedQty) : gap == null ? "" : formatQty(gap),
    }]
  })
}

async function openRequirementId(ctx: TenantContext) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM PurchaseRequirement
    WHERE businessId = ${ctx.businessId} AND warehouseId = ${ctx.warehouseId} AND status = 'OPEN'
    ORDER BY createdAt DESC
    LIMIT 1
  `
  return rows[0]?.id ?? null
}

async function openQuantities(ctx: TenantContext) {
  const id = await openRequirementId(ctx)
  const map = new Map<string, number>()
  if (!id) return map
  const lines = await prisma.$queryRaw<{ productId: string; quantity: number }[]>`
    SELECT productId, quantity FROM PurchaseRequirementLine WHERE requirementId = ${id}
  `
  for (const line of lines) map.set(line.productId, line.quantity)
  return map
}

export async function saveRequirement(ctx: TenantContext, lines: { productId: string; quantity: string }[]) {
  assertCan(ctx, "purchases")
  const clean = lines
    .map((line) => ({ productId: line.productId, quantity: toQtyInt(line.quantity || "0") }))
    .filter((line) => line.quantity > 0)
  if (clean.length === 0) throw new AppError("Indica la cantidad de al menos un producto")
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, id: { in: clean.map((line) => line.productId) }, isActive: true },
    select: { id: true },
  })
  if (products.length !== new Set(clean.map((line) => line.productId)).size) throw new AppError("Hay un producto que no está en el catálogo")
  const previous = await openRequirementId(ctx)
  const id = randomUUID()
  await prisma.$transaction(async (tx) => {
    if (previous) {
      await tx.$executeRaw`DELETE FROM PurchaseRequirementLine WHERE requirementId = ${previous}`
      await tx.$executeRaw`DELETE FROM PurchaseRequirement WHERE id = ${previous}`
    }
    await tx.$executeRaw`
      INSERT INTO PurchaseRequirement (id, businessId, warehouseId, userId, status, createdAt)
      VALUES (${id}, ${ctx.businessId}, ${ctx.warehouseId}, ${ctx.userId}, 'OPEN', ${new Date()})
    `
    for (const line of clean) {
      await tx.$executeRaw`
        INSERT INTO PurchaseRequirementLine (id, requirementId, productId, quantity)
        VALUES (${randomUUID()}, ${id}, ${line.productId}, ${line.quantity})
      `
    }
  })
}

export async function receptionList(ctx: TenantContext): Promise<ReceptionLine[]> {
  assertCan(ctx, "purchases")
  const id = await openRequirementId(ctx)
  if (!id) return []
  const lines = await prisma.$queryRaw<{ productId: string; quantity: number }[]>`
    SELECT productId, quantity FROM PurchaseRequirementLine WHERE requirementId = ${id}
  `
  if (lines.length === 0) return []
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, id: { in: lines.map((line) => line.productId) } },
    include: { baseUnit: true, presentations: { where: { isActive: true }, orderBy: { name: "asc" } } },
  })
  const byId = new Map(products.map((product) => [product.id, product]))
  return lines.flatMap((line) => {
    const product = byId.get(line.productId)
    if (!product || product.presentations.length === 0) return []
    const presentation = product.presentations.find((item) => item.factorToBase === QTY_SCALE)
      ?? product.presentations.find((item) => item.isDefault)
      ?? product.presentations[0]
    const presentationQty = fromQtyInt(line.quantity).mul(QTY_SCALE).div(presentation.factorToBase)
    const unitCost = fromMoneyInt(product.costPrice).mul(fromQtyInt(presentation.factorToBase))
    return [{
      productId: product.id,
      name: product.name,
      unit: product.baseUnit.symbol,
      quantity: presentationQty.toFixed(4).replace(/\.?0+$/, ""),
      unitCost: unitCost.toFixed(2),
      presentationId: presentation.id,
      trackLots: product.trackLots,
      presentations: product.presentations.map((item) => ({
        id: item.id,
        name: item.name,
        unitCost: fromMoneyInt(product.costPrice).mul(fromQtyInt(item.factorToBase)).toFixed(2),
      })),
    }]
  })
}

export async function closeOpenRequirement(ctx: TenantContext) {
  const id = await openRequirementId(ctx)
  if (!id) return
  await prisma.$executeRaw`UPDATE PurchaseRequirement SET status = 'USED' WHERE id = ${id} AND businessId = ${ctx.businessId}`
}
