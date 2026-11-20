import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { assertCan } from "@/lib/roles"
import { D, QTY_SCALE, mulScale, toMoneyInt, toQtyInt } from "@/lib/money"
import type { TenantContext } from "@/lib/types"

type Tx = Prisma.TransactionClient

export type MoveType =
  | "PURCHASE"
  | "ENTRY"
  | "RETURN"
  | "SALE"
  | "SALE_VOID"
  | "ADJUST"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "SHRINKAGE"
  | "LOSS"
  | "INTERNAL"
  | "LOSS_VOID"

async function assertWarehouse(ctx: TenantContext, warehouseId: string, tx: Tx | typeof prisma = prisma) {
  const warehouse = await tx.warehouse.findFirst({
    where: { id: warehouseId, businessId: ctx.businessId, isActive: true },
  })
  if (!warehouse) throw new AppError("Almacén no encontrado")
  return warehouse
}

export async function presentationFactor(ctx: TenantContext, productId: string, presentationId?: string, tx: Tx | typeof prisma = prisma) {
  const product = await tx.product.findFirst({
    where: { id: productId, businessId: ctx.businessId },
    include: { presentations: true },
  })
  if (!product) throw new AppError("Producto no encontrado")
  const presentation = presentationId
    ? product.presentations.find((item) => item.id === presentationId && item.isActive)
    : product.presentations.find((item) => item.isDefault && item.isActive) ?? product.presentations.find((item) => item.isActive)
  if (!presentation) throw new AppError("Presentación no encontrada")
  return { product, presentation, factor: presentation.factorToBase }
}

export async function applyStock(
  tx: Tx,
  args: {
    businessId: string
    warehouseId: string
    productId: string
    userId: string
    direction: "IN" | "OUT"
    type: MoveType
    quantity: number
    reason?: string
    referenceType?: string
    referenceId?: string
    lotCode?: string
    expiresAt?: Date | null
  },
) {
  if (args.quantity <= 0) throw new AppError("La cantidad debe ser mayor que cero")

  const product = await tx.product.findFirst({
    where: { id: args.productId, businessId: args.businessId },
  })
  if (!product) throw new AppError("Producto no encontrado")
  const warehouse = await tx.warehouse.findFirst({
    where: { id: args.warehouseId, businessId: args.businessId },
  })
  if (!warehouse) throw new AppError("Almacén no encontrado")

  if (args.direction === "OUT") {
    const updated = await tx.stockBalance.updateMany({
      where: {
        businessId: args.businessId,
        warehouseId: args.warehouseId,
        productId: args.productId,
        quantity: { gte: args.quantity },
      },
      data: { quantity: { decrement: args.quantity } },
    })
    if (updated.count !== 1) throw new AppError(`Stock insuficiente de ${product.name}`)
  } else {
    await tx.stockBalance.upsert({
      where: { warehouseId_productId: { warehouseId: args.warehouseId, productId: args.productId } },
      create: {
        businessId: args.businessId,
        warehouseId: args.warehouseId,
        productId: args.productId,
        quantity: args.quantity,
      },
      update: { quantity: { increment: args.quantity } },
    })
  }

  if (product.trackLots) await syncLots(tx, args)

  const balance = await tx.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: args.warehouseId, productId: args.productId } },
  })
  if (balance.businessId !== args.businessId) throw new AppError("Stock de otro negocio")

  await tx.stockMovement.create({
    data: {
      businessId: args.businessId,
      warehouseId: args.warehouseId,
      productId: args.productId,
      userId: args.userId,
      direction: args.direction,
      type: args.type,
      quantity: args.quantity,
      balanceAfter: balance.quantity,
      reason: args.reason,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      lotCode: args.lotCode,
      expiresAt: args.expiresAt ?? undefined,
    },
  })
  return balance
}

async function syncLots(
  tx: Tx,
  args: {
    businessId: string
    warehouseId: string
    productId: string
    direction: "IN" | "OUT"
    quantity: number
    lotCode?: string
    expiresAt?: Date | null
  },
) {
  if (args.direction === "IN") {
    const code = args.lotCode?.trim()
    if (!code) throw new AppError("Indica el lote")
    await tx.lot.upsert({
      where: {
        warehouseId_productId_code: {
          warehouseId: args.warehouseId,
          productId: args.productId,
          code,
        },
      },
      create: {
        businessId: args.businessId,
        warehouseId: args.warehouseId,
        productId: args.productId,
        code,
        expiresAt: args.expiresAt ?? undefined,
        quantity: args.quantity,
      },
      update: {
        quantity: { increment: args.quantity },
        expiresAt: args.expiresAt ?? undefined,
      },
    })
    return
  }

  const lots = await tx.lot.findMany({
    where: { warehouseId: args.warehouseId, productId: args.productId, businessId: args.businessId, quantity: { gt: 0 } },
  })
  if (lots.length === 0) return

  const ordered = args.lotCode
    ? lots.filter((lot) => lot.code === args.lotCode)
    : [...lots].sort((a, b) => {
        if (!a.expiresAt && !b.expiresAt) return a.code.localeCompare(b.code)
        if (!a.expiresAt) return 1
        if (!b.expiresAt) return -1
        return a.expiresAt.getTime() - b.expiresAt.getTime()
      })

  let remaining = args.quantity
  for (const lot of ordered) {
    if (remaining <= 0) break
    const take = Math.min(remaining, lot.quantity)
    const updated = await tx.lot.updateMany({
      where: { id: lot.id, businessId: args.businessId, quantity: { gte: take } },
      data: { quantity: { decrement: take } },
    })
    if (updated.count !== 1) throw new AppError("El lote no tiene existencia suficiente")
    remaining -= take
  }
  if (remaining > 0) throw new AppError("Los lotes no cubren la salida")
}

function baseQuantity(quantity: string, factor: number) {
  const qtyInt = toQtyInt(quantity)
  if (qtyInt <= 0) throw new AppError("La cantidad debe ser mayor que cero")
  return mulScale(qtyInt, factor)
}

export async function stockIn(
  ctx: TenantContext,
  input: {
    productId: string
    presentationId?: string
    quantity: string
    type: "PURCHASE" | "ENTRY" | "RETURN"
    reason: string
    lotCode?: string
    expiresAt?: string
    warehouseId?: string
    /** Para encontrar luego estos movimientos (p. ej. "STOCK_ENTRY" en Entradas). */
    referenceType?: string
  },
) {
  assertCan(ctx, "inventoryMove")
  if (!input.reason.trim()) throw new AppError("Indica el motivo")
  const warehouseId = input.warehouseId ?? ctx.warehouseId
  await assertWarehouse(ctx, warehouseId)
  const { product, factor } = await measureFactor(ctx, input.productId, input.presentationId)
  const quantity = baseQuantity(input.quantity, factor)
  return prisma.$transaction((tx) =>
    applyStock(tx, {
      businessId: ctx.businessId,
      warehouseId,
      productId: product.id,
      userId: ctx.userId,
      direction: "IN",
      type: input.type,
      quantity,
      reason: input.reason.trim(),
      referenceType: input.referenceType,
      lotCode: input.lotCode?.trim(),
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    }),
  )
}

function baseUnitCost(unitCost: number, factor: number) {
  const value = D(unitCost).mul(QTY_SCALE).div(factor).toDecimalPlaces(0)
  if (!value.isInteger() || value.gt(Number.MAX_SAFE_INTEGER)) throw new AppError("Costo fuera de rango")
  return value.toNumber()
}

export async function receiveEntries(
  ctx: TenantContext,
  input: {
    type: "PURCHASE" | "ENTRY" | "RETURN"
    reason?: string
    lines: {
      productId: string
      presentationId?: string
      quantity: string
      unitCost: string
      warehouseId: string
      expiresAt?: string
      lotCode?: string
    }[]
  },
) {
  assertCan(ctx, "inventoryMove")
  const lines = input.lines.filter((line) => line.quantity.trim() !== "" && line.quantity.trim() !== "0")
  if (lines.length === 0) throw new AppError("Indica la cantidad de al menos un producto")
  const reason = input.reason?.trim() || (input.type === "PURCHASE" ? "Compra recibida" : input.type === "RETURN" ? "Devolución" : "Ingreso")
  return prisma.$transaction(async (tx) => {
    for (const line of lines) {
      const warehouse = await assertWarehouse(ctx, line.warehouseId, tx)
      const loaded = await presentationFactor(ctx, line.productId, line.presentationId, tx)
      const quantity = baseQuantity(line.quantity, loaded.factor)
      const expiresAt = line.expiresAt ? new Date(`${line.expiresAt}T00:00:00`) : null
      if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new AppError(`Vencimiento inválido de ${loaded.product.name}`)
      if (loaded.product.trackLots && !expiresAt && !line.lotCode?.trim()) {
        throw new AppError(`Indica el vencimiento de ${loaded.product.name}`)
      }
      if (expiresAt) {
        await tx.product.updateMany({
          where: { id: loaded.product.id, businessId: ctx.businessId },
          data: { trackLots: true },
        })
      }
      await applyStock(tx, {
        businessId: ctx.businessId,
        warehouseId: warehouse.id,
        productId: loaded.product.id,
        userId: ctx.userId,
        direction: "IN",
        type: input.type,
        quantity,
        reason,
        referenceType: input.type === "PURCHASE" ? "PURCHASE" : undefined,
        lotCode: line.lotCode?.trim() || (expiresAt ? line.expiresAt : undefined),
        expiresAt,
      })
      if (input.type === "PURCHASE" && line.unitCost.trim()) {
        await tx.product.updateMany({
          where: { id: loaded.product.id, businessId: ctx.businessId },
          data: { costPrice: baseUnitCost(toMoneyInt(line.unitCost), loaded.factor) },
        })
      }
    }
  })
}

export async function stockOut(
  ctx: TenantContext,
  input: {
    productId: string
    presentationId?: string
    quantity: string
    type: "SHRINKAGE" | "LOSS" | "INTERNAL"
    reason: string
    lotCode?: string
    warehouseId?: string
  },
) {
  assertCan(ctx, "inventoryMove")
  if (!input.reason.trim()) throw new AppError("Indica el motivo")
  const warehouseId = input.warehouseId ?? ctx.warehouseId
  await assertWarehouse(ctx, warehouseId)
  const { product, factor } = await measureFactor(ctx, input.productId, input.presentationId)
  const quantity = baseQuantity(input.quantity, factor)
  return prisma.$transaction((tx) =>
    applyStock(tx, {
      businessId: ctx.businessId,
      warehouseId,
      productId: product.id,
      userId: ctx.userId,
      direction: "OUT",
      type: input.type,
      quantity,
      reason: input.reason.trim(),
      lotCode: input.lotCode?.trim(),
    }),
  )
}

/**
 * Lote para un ajuste de un producto con lotes: el elegido; si no se eligió y tiene un solo lote, ese;
 * si no tiene lotes y entra stock, uno automático AJ<fecha>. Con varios lotes, una entrada exige elegir.
 */
async function adjustmentLot(ctx: TenantContext, productId: string, direction: "IN" | "OUT", chosen?: string) {
  const code = chosen?.trim()
  if (code) return code
  const lots = await prisma.lot.findMany({
    where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId, productId },
    select: { code: true, quantity: true },
  })
  if (lots.length === 1) return lots[0].code
  if (direction === "OUT") return undefined
  const withStock = lots.filter((lot) => lot.quantity > 0)
  if (withStock.length === 1) return withStock[0].code
  if (lots.length === 0) return `AJ${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`
  throw new AppError("Este producto tiene varios lotes: elige a cuál entra el sobrante")
}

export async function setStock(
  ctx: TenantContext,
  input: { productId: string; presentationId?: string; quantity: string; reason: string; lotCode?: string; expiresAt?: string },
) {
  assertCan(ctx, "adjust")
  if (!input.reason.trim()) throw new AppError("El ajuste necesita un motivo")
  const { product, factor } = await presentationFactor(ctx, input.productId, input.presentationId)
  const counted = toQtyInt(input.quantity)
  if (counted < 0) throw new AppError("La cantidad no puede ser negativa")
  const target = mulScale(counted, factor)
  return prisma.$transaction(async (tx) => {
    const current = await tx.stockBalance.findUnique({
      where: { warehouseId_productId: { warehouseId: ctx.warehouseId, productId: product.id } },
    })
    const balance = current?.businessId === ctx.businessId ? current.quantity : 0
    const delta = target - balance
    if (delta === 0) throw new AppError("El stock ya está en esa cantidad")
    const lotCode = product.trackLots ? await adjustmentLot(ctx, product.id, delta > 0 ? "IN" : "OUT", input.lotCode) : input.lotCode?.trim()
    return applyStock(tx, {
      businessId: ctx.businessId,
      warehouseId: ctx.warehouseId,
      productId: product.id,
      userId: ctx.userId,
      direction: delta > 0 ? "IN" : "OUT",
      type: "ADJUST",
      quantity: Math.abs(delta),
      reason: input.reason.trim(),
      referenceType: "ADJUST",
      lotCode,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
  })
}

export async function adjustStock(
  ctx: TenantContext,
  input: {
    productId: string
    presentationId?: string
    quantity: string
    direction: "IN" | "OUT"
    reason: string
    lotCode?: string
  },
) {
  assertCan(ctx, "adjust")
  if (!input.reason.trim()) throw new AppError("El ajuste necesita un motivo")
  const { product, factor } = await presentationFactor(ctx, input.productId, input.presentationId)
  const quantity = baseQuantity(input.quantity, factor)
  const lotCode = product.trackLots ? await adjustmentLot(ctx, product.id, input.direction, input.lotCode) : input.lotCode?.trim()
  return prisma.$transaction((tx) =>
    applyStock(tx, {
      businessId: ctx.businessId,
      warehouseId: ctx.warehouseId,
      productId: product.id,
      userId: ctx.userId,
      direction: input.direction,
      type: "ADJUST",
      quantity,
      reason: input.reason.trim(),
      referenceType: "ADJUST",
      lotCode,
    }),
  )
}

export async function sendTransfer(
  ctx: TenantContext,
  input: {
    fromWarehouseId?: string
    toWarehouseId: string
    notes?: string
    lines: { productId: string; presentationId?: string; quantity: string }[]
  },
) {
  assertCan(ctx, "transfer")
  if (!input.lines.length) throw new AppError("Agrega productos a la transferencia")
  const fromWarehouseId = input.fromWarehouseId?.trim() || ctx.warehouseId
  if (input.toWarehouseId === fromWarehouseId) throw new AppError("El destino debe ser otro almacén")
  await assertWarehouse(ctx, fromWarehouseId)
  await assertWarehouse(ctx, input.toWarehouseId)

  return prisma.$transaction(async (tx) => {
    const prepared = []
    for (const line of input.lines) {
      const loaded = await presentationFactor(ctx, line.productId, line.presentationId, tx)
      prepared.push({ productId: loaded.product.id, quantity: baseQuantity(line.quantity, loaded.factor) })
    }
    const transfer = await tx.stockTransfer.create({
      data: {
        businessId: ctx.businessId,
        fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        userId: ctx.userId,
        status: "SENT",
        notes: input.notes?.trim() || null,
        sentAt: new Date(),
        lines: { create: prepared },
      },
    })
    for (const line of prepared) {
      await applyStock(tx, {
        businessId: ctx.businessId,
        warehouseId: fromWarehouseId,
        productId: line.productId,
        userId: ctx.userId,
        direction: "OUT",
        type: "TRANSFER_OUT",
        quantity: line.quantity,
        reason: input.notes?.trim() || "Transferencia",
        referenceType: "TRANSFER",
        referenceId: transfer.id,
      })
    }
    return transfer
  })
}

export async function receiveTransfer(ctx: TenantContext, transferId: string) {
  assertCan(ctx, "transfer")
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: { id: transferId, businessId: ctx.businessId },
      include: { lines: true },
    })
    if (!transfer) throw new AppError("Transferencia no encontrada")
    if (transfer.status !== "SENT") throw new AppError("La transferencia no está en tránsito")
    for (const line of transfer.lines) {
      await applyStock(tx, {
        businessId: ctx.businessId,
        warehouseId: transfer.toWarehouseId,
        productId: line.productId,
        userId: ctx.userId,
        direction: "IN",
        type: "TRANSFER_IN",
        quantity: line.quantity,
        reason: "Recepción de transferencia",
        referenceType: "TRANSFER",
        referenceId: transfer.id,
      })
    }
    return tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: "RECEIVED", receivedAt: new Date() },
    })
  })
}

export async function cancelTransfer(ctx: TenantContext, transferId: string) {
  assertCan(ctx, "transfer")
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: { id: transferId, businessId: ctx.businessId },
      include: { lines: true },
    })
    if (!transfer) throw new AppError("Transferencia no encontrada")
    if (transfer.status !== "SENT") throw new AppError("Solo se anula una transferencia en tránsito")
    for (const line of transfer.lines) {
      await applyStock(tx, {
        businessId: ctx.businessId,
        warehouseId: transfer.fromWarehouseId,
        productId: line.productId,
        userId: ctx.userId,
        direction: "IN",
        type: "TRANSFER_IN",
        quantity: line.quantity,
        reason: "Anulación de transferencia",
        referenceType: "TRANSFER",
        referenceId: transfer.id,
      })
    }
    return tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: "CANCELLED" },
    })
  })
}

export async function listBalances(ctx: TenantContext) {
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, parentId: null },
    include: {
      baseUnit: true,
      balances: { where: { warehouseId: ctx.warehouseId } },
      variants: { include: { balances: { where: { warehouseId: ctx.warehouseId } }, baseUnit: true } },
    },
    orderBy: { name: "asc" },
  })
  return products
}

export async function listKardex(ctx: TenantContext, productId?: string) {
  return prisma.stockMovement.findMany({
    where: {
      businessId: ctx.businessId,
      warehouseId: productId ? undefined : ctx.warehouseId,
      productId: productId || undefined,
    },
    include: { product: true, warehouse: true, user: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  })
}

export async function inventoryValue(ctx: TenantContext) {
  const balances = await prisma.stockBalance.findMany({
    where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId, quantity: { gt: 0 } },
    include: { product: true },
  })
  return balances.reduce((sum, row) => sum + mulScale(row.product.costPrice, row.quantity), 0)
}

/**
 * Unidades en que se puede expresar una cantidad de un producto: su unidad base (kg, und…),
 * las unidades convertibles a ella (g → kg) y sus presentaciones con factor distinto de 1 (saco 50 kg).
 * El id de una unidad es "unit:<unitId>"; el de una presentación, su propio id.
 */
export const UNIT_OPTION = "unit:"

export type MeasureOption = { id: string; name: string; factor: number }

type MeasureProduct = {
  baseUnitId: string
  baseUnit: { symbol: string }
  presentations: { id: string; name: string; factorToBase: number; isActive: boolean }[]
}

export async function unitConversionsTo(businessId: string, tx: Tx | typeof prisma = prisma) {
  const rows = await tx.unitConversion.findMany({ where: { businessId }, include: { fromUnit: { select: { symbol: true } } } })
  const map = new Map<string, { unitId: string; symbol: string; factor: number }[]>()
  for (const row of rows) {
    const list = map.get(row.toUnitId) ?? []
    list.push({ unitId: row.fromUnitId, symbol: row.fromUnit.symbol, factor: row.factor })
    map.set(row.toUnitId, list)
  }
  return map
}

export function measureOptions(product: MeasureProduct, conversions: Map<string, { unitId: string; symbol: string; factor: number }[]>): MeasureOption[] {
  const options: MeasureOption[] = [{ id: UNIT_OPTION + product.baseUnitId, name: product.baseUnit.symbol, factor: 1 }]
  for (const item of conversions.get(product.baseUnitId) ?? []) {
    options.push({ id: UNIT_OPTION + item.unitId, name: item.symbol, factor: item.factor / QTY_SCALE })
  }
  for (const item of product.presentations) {
    if (!item.isActive || item.factorToBase === QTY_SCALE) continue
    options.push({ id: item.id, name: item.name, factor: item.factorToBase / QTY_SCALE })
  }
  return options
}

/** Factor (escala ×10 000) de una unidad o presentación del producto hacia su unidad base. */
export async function measureFactor(ctx: TenantContext, productId: string, optionId?: string, tx: Tx | typeof prisma = prisma) {
  if (optionId?.startsWith(UNIT_OPTION)) {
    const product = await tx.product.findFirst({
      where: { id: productId, businessId: ctx.businessId },
      include: { baseUnit: { select: { symbol: true } } },
    })
    if (!product) throw new AppError("Producto no encontrado")
    const unitId = optionId.slice(UNIT_OPTION.length)
    if (unitId === product.baseUnitId) return { product, name: product.baseUnit.symbol, factor: QTY_SCALE }
    const conversion = await tx.unitConversion.findFirst({
      where: { businessId: ctx.businessId, fromUnitId: unitId, toUnitId: product.baseUnitId },
      include: { fromUnit: { select: { symbol: true } } },
    })
    if (!conversion) throw new AppError(`Esa unidad no se convierte a ${product.baseUnit.symbol}`)
    return { product, name: conversion.fromUnit.symbol, factor: conversion.factor }
  }
  const { product, presentation, factor } = await presentationFactor(ctx, productId, optionId, tx)
  return { product, name: presentation.name, factor }
}
