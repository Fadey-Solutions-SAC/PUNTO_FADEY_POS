import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { applyStock } from "@/lib/inventory"
import { D, QTY_SCALE, mulScale, toMoneyInt, toQtyInt } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

type Tx = Prisma.TransactionClient

export type PurchaseLineInput = {
  productId: string
  presentationId?: string
  quantity: string
  unitCost: string
}

function baseCost(unitCost: number, factor: number) {
  const value = D(unitCost).mul(QTY_SCALE).div(factor).toDecimalPlaces(0)
  if (!value.isInteger() || value.gt(Number.MAX_SAFE_INTEGER)) throw new AppError("Costo fuera de rango")
  return value.toNumber()
}

async function lineFromInput(tx: Tx, ctx: TenantContext, input: PurchaseLineInput) {
  const product = await tx.product.findFirst({
    where: { id: input.productId, businessId: ctx.businessId, isActive: true },
    include: { presentations: true },
  })
  if (!product) throw new AppError("Producto no encontrado")
  const presentation = input.presentationId
    ? product.presentations.find((item) => item.id === input.presentationId && item.isActive)
    : product.presentations.find((item) => item.isDefault && item.isActive) ?? product.presentations[0]
  if (!presentation) throw new AppError(`Presentación no encontrada para ${product.name}`)
  const quantity = toQtyInt(input.quantity)
  if (quantity <= 0) throw new AppError("La cantidad debe ser mayor que cero")
  const unitCost = toMoneyInt(input.unitCost)
  const baseQuantity = mulScale(quantity, presentation.factorToBase)
  const total = mulScale(unitCost, quantity)
  return {
    productId: product.id,
    presentationId: presentation.id,
    description: `${product.name} · ${presentation.name}`,
    quantity,
    factorToBase: presentation.factorToBase,
    baseQuantity,
    unitCost,
    total,
    baseUnitCost: baseCost(unitCost, presentation.factorToBase),
  }
}

export async function saveSupplier(
  ctx: TenantContext,
  input: {
    id?: string
    tradeName: string
    legalName?: string
    taxId?: string
    address?: string
    phone?: string
    email?: string
    contact?: string
    isActive?: boolean
  },
) {
  assertCan(ctx, "purchases")
  const tradeName = input.tradeName.trim()
  if (tradeName.length < 2) throw new AppError("Indica el nombre comercial")
  const data = {
    tradeName,
    legalName: input.legalName?.trim() || null,
    taxId: input.taxId?.trim() || null,
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    contact: input.contact?.trim() || null,
    isActive: input.isActive ?? true,
  }
  if (input.id) {
    const updated = await prisma.supplier.updateMany({ where: { id: input.id, businessId: ctx.businessId }, data })
    if (updated.count !== 1) throw new AppError("Proveedor no encontrado")
    return input.id
  }
  const created = await prisma.supplier.create({ data: { ...data, businessId: ctx.businessId } })
  return created.id
}

export async function listSuppliers(ctx: TenantContext) {
  assertCan(ctx, "purchases")
  return prisma.supplier.findMany({ where: { businessId: ctx.businessId }, orderBy: { tradeName: "asc" } })
}

export async function createPurchase(
  ctx: TenantContext,
  input: {
    supplierId: string
    documentNumber?: string
    idempotencyKey: string
    discount?: string
    tax?: string
    notes?: string
    receiveNow?: boolean
    payNow?: string
    payMethod?: "CASH" | "TRANSFER" | "OTHER"
    lines: PurchaseLineInput[]
  },
) {
  assertCan(ctx, "purchases")
  const key = input.idempotencyKey.trim()
  if (key.length < 8) throw new AppError("Falta la clave de la compra")
  const existing = await prisma.purchase.findUnique({
    where: { businessId_idempotencyKey: { businessId: ctx.businessId, idempotencyKey: key } },
  })
  if (existing) return existing

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, businessId: ctx.businessId, isActive: true },
    })
    if (!supplier) throw new AppError("Proveedor no encontrado")
    const documentNumber = input.documentNumber?.trim() || null
    if (documentNumber) {
      const duplicate = await tx.purchase.findFirst({
        where: { businessId: ctx.businessId, supplierId: supplier.id, documentNumber, status: { not: "CANCELLED" } },
      })
      if (duplicate) throw new AppError("Ese documento ya está registrado para este proveedor")
    }
    const warehouse = await tx.warehouse.findFirst({
      where: { id: ctx.warehouseId, businessId: ctx.businessId, isActive: true },
    })
    if (!warehouse) throw new AppError("Almacén no encontrado")
    if (input.lines.length === 0) throw new AppError("Agrega al menos un producto")
    const built = []
    for (const line of input.lines) built.push(await lineFromInput(tx, ctx, line))
    const subtotal = built.reduce((sum, line) => sum + line.total, 0)
    const discount = toMoneyInt(input.discount || "0")
    const tax = toMoneyInt(input.tax || "0")
    if (discount > subtotal) throw new AppError("El descuento supera el subtotal")
    const total = subtotal - discount + tax
    const purchase = await tx.purchase.create({
      data: {
        businessId: ctx.businessId,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        userId: ctx.userId,
        status: "ORDERED",
        documentNumber,
        idempotencyKey: key,
        subtotal,
        discount,
        tax,
        total,
        notes: input.notes?.trim() || null,
        lines: {
          create: built.map((line) => ({
            productId: line.productId,
            presentationId: line.presentationId,
            description: line.description,
            quantity: line.quantity,
            factorToBase: line.factorToBase,
            baseQuantity: line.baseQuantity,
            unitCost: line.unitCost,
            total: line.total,
          })),
        },
      },
      include: { lines: true },
    })
    if (input.receiveNow) await receiveInside(tx, ctx, purchase.id)
    const payNow = toMoneyInt(input.payNow || "0")
    if (payNow > 0) await payInside(tx, ctx, purchase.id, payNow, input.payMethod || "CASH")
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: "PURCHASE_CREATE",
        entity: "Purchase",
        entityId: purchase.id,
        detail: purchase.documentNumber,
      },
    })
    return tx.purchase.findFirstOrThrow({ where: { id: purchase.id, businessId: ctx.businessId } })
  })
}

async function receiveInside(tx: Tx, ctx: TenantContext, purchaseId: string) {
  const purchase = await tx.purchase.findFirst({
    where: { id: purchaseId, businessId: ctx.businessId },
    include: { lines: true },
  })
  if (!purchase) throw new AppError("Compra no encontrada")
  if (purchase.status === "CANCELLED" || purchase.status === "RECEIVED") {
    throw new AppError("Esta compra no se puede recibir")
  }
  for (const line of purchase.lines) {
    const pending = line.baseQuantity - line.receivedBase
    if (pending <= 0) continue
    await applyStock(tx, {
      businessId: ctx.businessId,
      warehouseId: purchase.warehouseId,
      productId: line.productId,
      userId: ctx.userId,
      direction: "IN",
      type: "PURCHASE",
      quantity: pending,
      reason: purchase.documentNumber ? `Compra ${purchase.documentNumber}` : "Compra",
      referenceType: "PURCHASE",
      referenceId: purchase.id,
    })
    await tx.purchaseLine.update({ where: { id: line.id }, data: { receivedBase: line.baseQuantity } })
    await tx.product.updateMany({
      where: { id: line.productId, businessId: ctx.businessId },
      data: { costPrice: baseCost(line.unitCost, line.factorToBase) },
    })
  }
  await tx.purchase.updateMany({
    where: { id: purchase.id, businessId: ctx.businessId },
    data: { status: "RECEIVED", receivedAt: new Date() },
  })
}

async function payInside(tx: Tx, ctx: TenantContext, purchaseId: string, amount: number, method: "CASH" | "CARD" | "TRANSFER" | "OTHER") {
  const purchase = await tx.purchase.findFirst({ where: { id: purchaseId, businessId: ctx.businessId } })
  if (!purchase) throw new AppError("Compra no encontrada")
  if (purchase.status === "CANCELLED") throw new AppError("La compra está anulada")
  const due = purchase.total - purchase.paid
  if (amount <= 0) throw new AppError("El pago debe ser mayor que cero")
  if (amount > due) throw new AppError("El pago supera la deuda con el proveedor")
  let sessionId: string | null = null
  if (method === "CASH") {
    const session = await tx.cashSession.findFirst({
      where: { businessId: ctx.businessId, userId: ctx.userId, branchId: ctx.branchId, status: "OPEN" },
    })
    if (!session) throw new AppError("Abre una caja para pagar en efectivo")
    sessionId = session.id
    await tx.cashMovement.create({
      data: {
        businessId: ctx.businessId,
        sessionId: session.id,
        userId: ctx.userId,
        type: "EXPENSE",
        amount,
        reason: `Pago a proveedor ${purchase.documentNumber ?? purchase.id}`,
      },
    })
  }
  await tx.purchasePayment.create({
    data: { businessId: ctx.businessId, purchaseId: purchase.id, sessionId, userId: ctx.userId, method, amount },
  })
  await tx.purchase.updateMany({
    where: { id: purchase.id, businessId: ctx.businessId },
    data: { paid: { increment: amount } },
  })
}

export async function receivePurchase(ctx: TenantContext, purchaseId: string) {
  assertCan(ctx, "purchases")
  return prisma.$transaction(async (tx) => {
    await receiveInside(tx, ctx, purchaseId)
    await tx.auditLog.create({
      data: { businessId: ctx.businessId, userId: ctx.userId, action: "PURCHASE_RECEIVE", entity: "Purchase", entityId: purchaseId },
    })
  })
}

export async function payPurchase(ctx: TenantContext, purchaseId: string, amount: string, method: "CASH" | "CARD" | "TRANSFER" | "OTHER") {
  assertCan(ctx, "purchases")
  const value = toMoneyInt(amount)
  return prisma.$transaction(async (tx) => {
    await payInside(tx, ctx, purchaseId, value, method)
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: "PURCHASE_PAY",
        entity: "Purchase",
        entityId: purchaseId,
        detail: String(value),
      },
    })
  })
}

export async function listPurchases(ctx: TenantContext) {
  assertCan(ctx, "purchases")
  return prisma.purchase.findMany({
    where: { businessId: ctx.businessId },
    include: { supplier: true, lines: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
}

export async function getPurchase(ctx: TenantContext, id: string) {
  assertCan(ctx, "purchases")
  const purchase = await prisma.purchase.findFirst({
    where: { id, businessId: ctx.businessId },
    include: { supplier: true, lines: true, payments: true, warehouse: true, user: true },
  })
  if (!purchase) throw new AppError("Compra no encontrada")
  return purchase
}
