/**
 * Mermas y pérdidas.
 *
 * Una merma saca stock del almacén actual por un motivo (vencido, roto, robo, consumo interno…)
 * y la valoriza al costo del producto en ese momento. Todo pasa por `applyStock`, así que:
 * - el saldo nunca queda negativo y los lotes se descuentan;
 * - queda un movimiento en el kardex (tipo SHRINKAGE, LOSS o INTERNAL) enlazado al registro;
 * - revertir devuelve el stock con un movimiento LOSS_VOID y deja el registro como "Revertida".
 */
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { applyStock, measureFactor, measureOptions, unitConversionsTo } from "@/lib/inventory"
import { D, QTY_SCALE, mulScale, toQtyInt } from "@/lib/money"
import { assertCan, assertCanAny } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

export const LOSS_TYPES = {
  SHRINKAGE: "Merma",
  LOSS: "Pérdida",
  INTERNAL: "Consumo interno",
} as const

export type LossType = keyof typeof LOSS_TYPES

/** Causas sugeridas por tipo. "Otro" exige una nota. */
export const LOSS_CAUSES: Record<LossType, string[]> = {
  SHRINKAGE: ["Vencido", "Deteriorado", "Roto o dañado", "Merma natural", "Otro"],
  LOSS: ["Robo", "Extravío o faltante", "Otro"],
  INTERNAL: ["Consumo del personal", "Uso en el negocio", "Muestra o degustación", "Donación", "Otro"],
}

export function isLossType(value: string): value is LossType {
  return value in LOSS_TYPES
}

/** Costo en céntimos de `baseQty` (×10 000) a `costPrice` céntimos por unidad base. */
function costOf(costPrice: number, baseQty: number) {
  return D(costPrice).mul(baseQty).div(QTY_SCALE).toDecimalPlaces(0).toNumber()
}

export async function registerLoss(
  ctx: TenantContext,
  input: {
    productId: string
    presentationId?: string
    quantity: string
    type: string
    cause: string
    note?: string
    lotCode?: string
  },
) {
  assertCan(ctx, "inventoryMove")
  if (!isLossType(input.type)) throw new AppError("Tipo de merma inválido")
  const type = input.type
  const cause = input.cause.trim()
  if (!LOSS_CAUSES[type].includes(cause)) throw new AppError("Elige la causa")
  const note = input.note?.trim() || null
  if (cause === "Otro" && !note) throw new AppError("Describe el motivo en la nota")

  const { product, name: measureName, factor } = await measureFactor(ctx, input.productId, input.presentationId)
  const qtyInt = toQtyInt(input.quantity || "0")
  if (qtyInt <= 0) throw new AppError("La cantidad debe ser mayor que cero")
  const baseQty = mulScale(qtyInt, factor)
  const lotCode = input.lotCode?.trim() || null
  if (product.trackLots && !lotCode) throw new AppError("Este producto controla lotes: elige el lote")

  const unitCost = product.costPrice
  const totalCost = costOf(unitCost, baseQty)
  const label = `${LOSS_TYPES[type]} · ${cause}${note ? ` · ${note}` : ""}`

  return prisma.$transaction(async (tx) => {
    const loss = await tx.stockLoss.create({
      data: {
        businessId: ctx.businessId,
        warehouseId: ctx.warehouseId,
        productId: product.id,
        userId: ctx.userId,
        type,
        cause,
        quantity: baseQty,
        presentationName: measureName,
        presentationQty: input.quantity,
        unitCost,
        totalCost,
        lotCode,
        note,
      },
    })
    await applyStock(tx, {
      businessId: ctx.businessId,
      warehouseId: ctx.warehouseId,
      productId: product.id,
      userId: ctx.userId,
      direction: "OUT",
      type,
      quantity: baseQty,
      reason: label,
      referenceType: "STOCK_LOSS",
      referenceId: loss.id,
      lotCode: lotCode ?? undefined,
    })
    const movement = await tx.stockMovement.findFirst({
      where: { businessId: ctx.businessId, referenceType: "STOCK_LOSS", referenceId: loss.id },
      select: { id: true },
    })
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: "stock_loss.create",
        entity: "StockLoss",
        entityId: loss.id,
        detail: `${product.name}: ${input.quantity} ${measureName} · ${label} · costo ${totalCost}`,
      },
    })
    return tx.stockLoss.update({ where: { id: loss.id }, data: { movementId: movement?.id ?? null } })
  })
}

/** Revierte una merma: el stock vuelve al almacén (y al mismo lote). Solo dueño o administrador. */
export async function voidLoss(ctx: TenantContext, lossId: string, reason: string) {
  assertCan(ctx, "adjust")
  const why = reason.trim()
  if (!why) throw new AppError("Indica por qué se revierte")
  return prisma.$transaction(async (tx) => {
    const loss = await tx.stockLoss.findFirst({ where: { id: lossId, businessId: ctx.businessId } })
    if (!loss) throw new AppError("Registro no encontrado")
    if (loss.status === "VOIDED") throw new AppError("Este registro ya fue revertido")
    await applyStock(tx, {
      businessId: ctx.businessId,
      warehouseId: loss.warehouseId,
      productId: loss.productId,
      userId: ctx.userId,
      direction: "IN",
      type: "LOSS_VOID",
      quantity: loss.quantity,
      reason: `Reversión de ${LOSS_TYPES[loss.type as LossType] ?? "merma"} · ${why}`,
      referenceType: "STOCK_LOSS",
      referenceId: loss.id,
      lotCode: loss.lotCode ?? undefined,
    })
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: "stock_loss.void",
        entity: "StockLoss",
        entityId: loss.id,
        detail: why,
      },
    })
    return tx.stockLoss.update({
      where: { id: loss.id },
      data: { status: "VOIDED", voidedAt: new Date(), voidedById: ctx.userId, voidReason: why },
    })
  })
}

export type LossFilter = { type?: string; includeVoided?: boolean }

/** Registros del período y resumen (solo los activos suman). */
export async function listLosses(ctx: TenantContext, range: { from: Date; to: Date }, filter: LossFilter = {}) {
  assertCanAny(ctx, ["inventoryMove", "reports"])
  const rows = await prisma.stockLoss.findMany({
    where: {
      businessId: ctx.businessId,
      createdAt: { gte: range.from, lte: range.to },
      ...(filter.type && isLossType(filter.type) ? { type: filter.type } : {}),
      ...(filter.includeVoided === false ? { status: "ACTIVE" } : {}),
    },
    include: {
      product: { select: { name: true, internalCode: true, baseUnit: { select: { symbol: true } }, category: { select: { name: true } } } },
      user: { select: { name: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  const active = rows.filter((row) => row.status === "ACTIVE")
  const sumBy = (key: (row: (typeof active)[number]) => string) => {
    const map = new Map<string, { cost: number; count: number }>()
    for (const row of active) {
      const k = key(row)
      const item = map.get(k) ?? { cost: 0, count: 0 }
      item.cost += row.totalCost
      item.count += 1
      map.set(k, item)
    }
    return [...map.entries()].sort((a, b) => b[1].cost - a[1].cost)
  }
  return {
    rows,
    totalCost: active.reduce((sum, row) => sum + row.totalCost, 0),
    count: active.length,
    voided: rows.length - active.length,
    byType: sumBy((row) => row.type),
    byCause: sumBy((row) => row.cause),
    byProduct: sumBy((row) => row.product.name),
  }
}

/** Productos del almacén actual para elegir en el registro (con stock, costo, presentaciones y lotes). */
export async function lossFormData(ctx: TenantContext) {
  assertCan(ctx, "inventoryMove")
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, isActive: true },
    include: {
      baseUnit: { select: { symbol: true } },
      presentations: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] },
      barcodes: { select: { code: true } },
      balances: { where: { warehouseId: ctx.warehouseId }, select: { quantity: true } },
      lots: {
        where: { warehouseId: ctx.warehouseId, quantity: { gt: 0 } },
        orderBy: [{ expiresAt: "asc" }, { code: "asc" }],
        select: { code: true, quantity: true, expiresAt: true },
      },
    },
    orderBy: { name: "asc" },
  })
  const conversions = await unitConversionsTo(ctx.businessId)
  return products.map((product) => ({ ...product, measures: measureOptions(product, conversions) }))
}
