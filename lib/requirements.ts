import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { fromMoneyInt, fromQtyInt, formatQty, QTY_SCALE, toQtyInt } from "@/lib/money"
import { measureOptions, unitConversionsTo, UNIT_OPTION } from "@/lib/inventory"
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
  trackLots?: boolean
  salePrice?: string
  presentations: { id: string; name: string; unitCost: string; salePrice?: string }[]
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

/** Precio de venta de una presentación: el suyo, o el del producto por su factor. */
function salePriceOf(product: { salePrice: number }, presentation: { price: number | null; factorToBase: number }) {
  if (presentation.price != null) return fromMoneyInt(presentation.price).toFixed(2)
  return fromMoneyInt(product.salePrice).mul(fromQtyInt(presentation.factorToBase)).toFixed(2)
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
  const conversions = await unitConversionsTo(ctx.businessId)
  const byId = new Map(products.map((product) => [product.id, product]))
  return lines.flatMap((line) => {
    const product = byId.get(line.productId)
    if (!product) return []
    // Opciones: la unidad del producto (por defecto), unidades convertibles (g → kg) y presentaciones (caja, saco…).
    const options = measureOptions(product, conversions).map((option) => {
      const presentation = product.presentations.find((item) => item.id === option.id)
      const factor = Math.round(option.factor * QTY_SCALE)
      return {
        id: option.id,
        name: option.name,
        unitCost: fromMoneyInt(product.costPrice).mul(fromQtyInt(factor)).toFixed(2),
        salePrice: presentation ? salePriceOf(product, presentation) : fromMoneyInt(product.salePrice).mul(fromQtyInt(factor)).toFixed(2),
      }
    })
    const base = options[0]
    return [{
      productId: product.id,
      name: product.name,
      unit: product.baseUnit.symbol,
      quantity: fromQtyInt(line.quantity).toFixed(4).replace(/\.?0+$/, ""),
      unitCost: base.unitCost,
      presentationId: UNIT_OPTION + product.baseUnitId,
      trackLots: product.trackLots,
      salePrice: base.salePrice,
      presentations: options,
    }]
  })
}

export async function closeOpenRequirement(ctx: TenantContext) {
  const id = await openRequirementId(ctx)
  if (!id) return
  await prisma.$executeRaw`UPDATE PurchaseRequirement SET status = 'USED' WHERE id = ${id} AND businessId = ${ctx.businessId}`
}

/**
 * Sugerencias para el requerimiento según lo que se quiere pedir:
 * - «stock»: productos con stock bajo (hasta el máximo si está definido).
 * - «mermas»: lo que se perdió por vencimiento o deterioro en el período (Mermas y pérdidas).
 * Se pueden limitar a una o varias marcas.
 */
export async function requirementSuggestions(
  ctx: TenantContext,
  input: { sources: string[]; brandIds: string[]; from: Date; to: Date },
) {
  assertCan(ctx, "purchases")
  const brandFilter = input.brandIds.length ? { brandId: { in: input.brandIds } } : {}
  const result = new Map<string, { productId: string; name: string; brand: string; unit: string; stock: string; reason: string; quantity: number }>()
  if (input.sources.includes("stock")) {
    const products = await prisma.product.findMany({
      where: { businessId: ctx.businessId, isActive: true, variants: { none: { isActive: true } }, ...brandFilter },
      include: { brand: true, baseUnit: true, balances: { where: { warehouseId: ctx.warehouseId } } },
      orderBy: { name: "asc" },
    })
    for (const product of products) {
      const stock = product.balances[0]?.quantity ?? 0
      if (!isLow(stock, product.minStock)) continue
      const target = product.maxStock != null && product.maxStock > stock ? product.maxStock - stock : product.minStock > stock ? product.minStock - stock : QTY_SCALE
      result.set(product.id, {
        productId: product.id,
        name: product.name,
        brand: product.brand?.name ?? "Sin marca",
        unit: product.baseUnit.symbol,
        stock: formatQty(stock),
        reason: "Stock bajo",
        quantity: target,
      })
    }
  }
  if (input.sources.includes("mermas")) {
    const losses = await prisma.stockLoss.findMany({
      where: {
        businessId: ctx.businessId,
        warehouseId: ctx.warehouseId,
        status: "ACTIVE",
        cause: { in: ["Vencido", "Deteriorado", "Roto o dañado"] },
        createdAt: { gte: input.from, lte: input.to },
        product: { isActive: true, ...brandFilter },
      },
      include: { product: { include: { brand: true, baseUnit: true, balances: { where: { warehouseId: ctx.warehouseId } } } } },
    })
    for (const loss of losses) {
      const current = result.get(loss.productId)
      const label = loss.cause === "Vencido" ? "Vencimiento" : "Deterioro"
      if (current) {
        current.quantity += loss.quantity
        if (!current.reason.includes(label)) current.reason += ` · ${label}`
        continue
      }
      result.set(loss.productId, {
        productId: loss.productId,
        name: loss.product.name,
        brand: loss.product.brand?.name ?? "Sin marca",
        unit: loss.product.baseUnit.symbol,
        stock: formatQty(loss.product.balances[0]?.quantity ?? 0),
        reason: label,
        quantity: loss.quantity,
      })
    }
  }
  return [...result.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((item) => ({ ...item, quantity: formatQty(item.quantity) }))
}

/** Requerimiento generado (abierto) con sus líneas, para verlo, modificarlo o cancelarlo. */
export async function openRequirement(ctx: TenantContext) {
  assertCan(ctx, "purchases")
  const id = await openRequirementId(ctx)
  if (!id) return null
  const [head] = await prisma.$queryRaw<{ id: string; createdAt: Date | string; userId: string }[]>`
    SELECT id, createdAt, userId FROM PurchaseRequirement WHERE id = ${id}
  `
  const lines = await prisma.$queryRaw<{ productId: string; quantity: number }[]>`
    SELECT productId, quantity FROM PurchaseRequirementLine WHERE requirementId = ${id}
  `
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, id: { in: lines.map((line) => line.productId) } },
    include: { brand: true, baseUnit: true, balances: { where: { warehouseId: ctx.warehouseId } } },
  })
  const user = head ? await prisma.user.findUnique({ where: { id: head.userId }, select: { name: true } }) : null
  const byId = new Map(products.map((product) => [product.id, product]))
  return {
    id,
    createdAt: head ? new Date(head.createdAt) : new Date(),
    userName: user?.name ?? "",
    lines: lines.flatMap((line) => {
      const product = byId.get(line.productId)
      if (!product) return []
      return [{
        productId: product.id,
        name: product.name,
        brand: product.brand?.name ?? "Sin marca",
        unit: product.baseUnit.symbol,
        stock: formatQty(product.balances[0]?.quantity ?? 0),
        quantity: formatQty(line.quantity),
      }]
    }).sort((a, b) => a.name.localeCompare(b.name, "es")),
  }
}

export async function cancelRequirement(ctx: TenantContext) {
  assertCan(ctx, "purchases")
  const id = await openRequirementId(ctx)
  if (!id) throw new AppError("No hay un requerimiento generado")
  await prisma.$executeRaw`UPDATE PurchaseRequirement SET status = 'CANCELLED' WHERE id = ${id} AND businessId = ${ctx.businessId}`
}

/** Productos activos para agregar a mano al requerimiento (buscador). */
export async function requirementCatalog(ctx: TenantContext) {
  assertCan(ctx, "purchases")
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, isActive: true, variants: { none: { isActive: true } } },
    include: { brand: true, baseUnit: true, balances: { where: { warehouseId: ctx.warehouseId } }, barcodes: { select: { code: true } } },
    orderBy: { name: "asc" },
  })
  return products.map((product) => ({
    productId: product.id,
    name: product.name,
    code: product.internalCode,
    barcodes: product.barcodes.map((item) => item.code),
    brand: product.brand?.name ?? "Sin marca",
    unit: product.baseUnit.symbol,
    stock: formatQty(product.balances[0]?.quantity ?? 0),
  }))
}
