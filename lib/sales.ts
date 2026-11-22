import { Prisma } from "@prisma/client"
import { findActiveSession } from "@/lib/cash"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { applyStock } from "@/lib/inventory"
import Decimal from "decimal.js"
import { formatQty, fromMoneyInt, fromPercentInt, mulScale, percent, toMoneyInt, toQtyInt } from "@/lib/money"
import { resolveUnitPriceCents } from "@/lib/pricing"
import { assertCan, can } from "@/lib/roles"
import type { SaleConfirmInput, SaleDraftInput, TenantContext } from "@/lib/types"

type Tx = Prisma.TransactionClient

async function pricedLines(tx: Tx, ctx: TenantContext, input: SaleDraftInput) {
  if (!input.lines.length) throw new AppError("Agrega productos a la venta")
  const list = input.priceListId
    ? await tx.priceList.findFirst({
        where: { id: input.priceListId, businessId: ctx.businessId },
        include: { items: true },
      })
    : null
  if (input.priceListId && !list) throw new AppError("Lista de precios no encontrada")

  let subtotal = 0
  const lines = []
  for (const raw of input.lines) {
    const product = await tx.product.findFirst({
      where: { id: raw.productId, businessId: ctx.businessId, isActive: true },
      include: { presentations: true, variants: { where: { isActive: true }, select: { id: true } } },
    })
    if (!product) throw new AppError("Hay un producto que no pertenece a este negocio")
    if (product.variants.length > 0) throw new AppError(`${product.name} se vende eligiendo una variante`)
    const presentation = product.presentations.find((item) => item.id === raw.presentationId && item.isActive)
    if (!presentation || presentation.businessId !== ctx.businessId) throw new AppError("Presentación no encontrada")
    const quantity = toQtyInt(raw.quantity)
    if (quantity <= 0) throw new AppError("La cantidad debe ser mayor que cero")
    const unitPrice = resolveUnitPriceCents({
      product,
      presentation,
      mode: input.mode,
      listItems: list ? list.items : null,
    })
    const total = mulScale(unitPrice, quantity)
    subtotal += total
    lines.push({
      productId: product.id,
      presentationId: presentation.id,
      description: `${product.name} · ${presentation.name}`,
      quantity,
      factorToBase: presentation.factorToBase,
      baseQuantity: mulScale(quantity, presentation.factorToBase),
      unitPrice,
      costPrice: product.costPrice,
      total,
    })
  }

  const discount = toMoneyInt(input.discount || "0")
  if (discount > subtotal) throw new AppError("El descuento supera el subtotal")
  if (percent(discount, subtotal).gt(fromPercentInt(ctx.discountLimitPct))) assertCan(ctx, "discountOver")
  return { lines, subtotal, discount, total: subtotal - discount, priceListId: list?.id ?? null }
}

export async function saveDraft(ctx: TenantContext, input: SaleDraftInput) {
  assertCan(ctx, "sell")
  if (!input.idempotencyKey.trim()) throw new AppError("Falta la clave de la venta")
  return prisma.$transaction(async (tx) => {
    const existing = await tx.sale.findUnique({
      where: { businessId_idempotencyKey: { businessId: ctx.businessId, idempotencyKey: input.idempotencyKey } },
    })
    if (existing && existing.status !== "DRAFT") {
      return tx.sale.findUniqueOrThrow({ where: { id: existing.id }, include: { lines: true } })
    }
    const priced = await pricedLines(tx, ctx, input)
    const customerId = await ownedCustomer(tx, ctx, input.customerId)
    const data = {
      branchId: ctx.branchId,
      warehouseId: ctx.warehouseId,
      userId: ctx.userId,
      customerId,
      priceListId: priced.priceListId,
      status: "DRAFT",
      saleType: input.saleType === "CREDIT" ? "CREDIT" : "CASH",
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
      notes: input.notes?.trim() || null,
      lines: { create: priced.lines },
    }
    if (existing) {
      await tx.saleLine.deleteMany({ where: { saleId: existing.id } })
      return tx.sale.update({ where: { id: existing.id }, data, include: { lines: true } })
    }
    return tx.sale.create({
      data: { ...data, businessId: ctx.businessId, idempotencyKey: input.idempotencyKey },
      include: { lines: true },
    })
  })
}

export async function readDraft(ctx: TenantContext, id: string) {
  assertCan(ctx, "sell")
  const sale = await prisma.sale.findFirst({
    where: { id, businessId: ctx.businessId, status: "DRAFT" },
    include: { lines: true },
  })
  if (!sale) throw new AppError("La venta pendiente ya no está disponible")
  const discountPercent = sale.subtotal > 0
    ? fromMoneyInt(sale.discount).mul(100).div(fromMoneyInt(sale.subtotal)).toFixed(2)
    : "0"
  return {
    id: sale.id,
    idempotencyKey: sale.idempotencyKey,
    customerId: sale.customerId,
    priceListId: sale.priceListId,
    mode: "SALE" as const,
    saleType: sale.saleType === "CREDIT" ? "CREDIT" as const : "CASH" as const,
    discountPercent,
    lines: sale.lines.map((line) => ({
      productId: line.productId,
      presentationId: line.presentationId ?? "",
      quantity: formatQty(line.quantity),
    })),
  }
}

async function ownedCustomer(tx: Tx, ctx: TenantContext, customerId?: string) {
  if (!customerId) return null
  const customer = await tx.customer.findFirst({ where: { id: customerId, businessId: ctx.businessId, isActive: true } })
  if (!customer) throw new AppError("Cliente no encontrado")
  return customer.id
}

function normalizePayments(input: SaleConfirmInput, total: number) {
  if (input.saleType === "CREDIT") {
    return [{ method: "CREDIT" as const, amount: total, reference: null as string | null }]
  }
  const rows = input.payments
    .map((payment) => ({
      method: payment.method,
      amount: toMoneyInt(payment.amount || "0"),
      reference: payment.reference?.trim() || null,
    }))
    .filter((payment) => payment.amount > 0)
  if (rows.some((payment) => payment.method === "CREDIT")) {
    throw new AppError("El crédito se registra como venta a crédito")
  }
  const paid = rows.reduce((sum, payment) => sum + payment.amount, 0)
  if (paid < total) throw new AppError("El pago no cubre el total")
  const extra = paid - total
  if (extra > 0) {
    const cash = rows.find((payment) => payment.method === "CASH")
    if (!cash || cash.amount < extra) throw new AppError("El vuelto solo se calcula sobre el efectivo")
    cash.amount -= extra
  }
  const applied = rows.reduce((sum, payment) => sum + payment.amount, 0)
  if (applied !== total) throw new AppError("Los pagos no cuadran con el total")
  return rows.filter((payment) => payment.amount > 0)
}

export async function confirmSale(ctx: TenantContext, input: SaleConfirmInput) {
  assertCan(ctx, "sell")
  if (!input.idempotencyKey.trim()) throw new AppError("Falta la clave de la venta")
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({
        where: { businessId_idempotencyKey: { businessId: ctx.businessId, idempotencyKey: input.idempotencyKey } },
      })
      if (existing && existing.status !== "DRAFT") {
        return tx.sale.findUniqueOrThrow({ where: { id: existing.id }, include: { lines: true, payments: true } })
      }

      const session = await findActiveSession(ctx, tx)
      if (!session) throw new AppError("Abre una caja antes de cobrar")

      const priced = await pricedLines(tx, ctx, input)
      const customerId = await ownedCustomer(tx, ctx, input.customerId)
      if (input.saleType === "CREDIT") {
        // Poner a cuenta de un cliente registrado: quien vende puede hacerlo (se respeta el límite del cliente).
        if (!can(ctx.role, "sell", ctx.grants) && !can(ctx.role, "credit", ctx.grants)) assertCan(ctx, "credit")
        if (!customerId) throw new AppError("Selecciona un cliente para vender a crédito")
        const customer = await tx.customer.findFirst({ where: { id: customerId, businessId: ctx.businessId } })
        if (!customer) throw new AppError("Cliente no encontrado")
        if (customer.creditLimit > 0 && customer.balance + priced.total > customer.creditLimit) {
          throw new AppError("El cliente supera su límite de crédito")
        }
      }
      const payments = normalizePayments(input, priced.total)
      const data = {
        branchId: ctx.branchId,
        warehouseId: ctx.warehouseId,
        sessionId: session.id,
        userId: ctx.userId,
        customerId,
        priceListId: priced.priceListId,
        status: "COMPLETED",
        saleType: input.saleType,
        subtotal: priced.subtotal,
        discount: priced.discount,
        total: priced.total,
        notes: input.notes?.trim() || null,
      }

      let saleId = existing?.id
      if (existing) {
        await tx.saleLine.deleteMany({ where: { saleId: existing.id } })
        await tx.sale.update({ where: { id: existing.id }, data })
      } else {
        const created = await tx.sale.create({
          data: { ...data, businessId: ctx.businessId, idempotencyKey: input.idempotencyKey },
        })
        saleId = created.id
      }
      if (!saleId) throw new AppError("No se pudo registrar la venta")

      await tx.saleLine.createMany({
        data: priced.lines.map((line) => ({ ...line, saleId })),
      })
      await tx.salePayment.createMany({
        data: payments.map((payment) => ({ ...payment, saleId })),
      })
      for (const line of priced.lines) {
        await applyStock(tx, {
          businessId: ctx.businessId,
          warehouseId: ctx.warehouseId,
          productId: line.productId,
          userId: ctx.userId,
          direction: "OUT",
          type: "SALE",
          quantity: line.baseQuantity,
          reason: "Venta",
          referenceType: "SALE",
          referenceId: saleId,
        })
      }
      if (input.saleType === "CREDIT" && customerId) {
        await tx.customer.updateMany({
          where: { id: customerId, businessId: ctx.businessId },
          data: { balance: { increment: priced.total } },
        })
      }
      return tx.sale.findFirstOrThrow({ where: { id: saleId, businessId: ctx.businessId }, include: { lines: true, payments: true } })
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const found = await prisma.sale.findUnique({
        where: { businessId_idempotencyKey: { businessId: ctx.businessId, idempotencyKey: input.idempotencyKey } },
        include: { lines: true, payments: true },
      })
      if (found && found.businessId === ctx.businessId) return found
    }
    throw error
  }
}

export async function voidSale(
  ctx: TenantContext,
  saleId: string,
  reasonRaw: string,
  stockMode: "restore" | "keep" = "restore",
) {
  assertCan(ctx, "voidSale")
  const reason = reasonRaw.trim().slice(0, 200)
  if (reason.length < 3) throw new AppError("Indica el motivo de la anulación")
  if (stockMode !== "restore" && stockMode !== "keep") throw new AppError("Elige qué hacer con el stock")
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, businessId: ctx.businessId },
      include: { lines: true, returns: true },
    })
    if (!sale) throw new AppError("Venta no encontrada")
    if (sale.status !== "COMPLETED") throw new AppError("Solo se anula una venta confirmada")
    if (sale.returns.length > 0) throw new AppError("La venta tiene devoluciones. Registra la devolución pendiente, no la anules.")
    if (stockMode === "restore") {
      for (const line of sale.lines) {
        await applyStock(tx, {
          businessId: ctx.businessId,
          warehouseId: sale.warehouseId,
          productId: line.productId,
          userId: ctx.userId,
          direction: "IN",
          type: "SALE_VOID",
          quantity: line.baseQuantity,
          reason: `Anulación: ${reason}`,
          referenceType: "SALE",
          referenceId: sale.id,
        })
      }
    }
    if (sale.saleType === "CREDIT" && sale.customerId) {
      const updated = await tx.customer.updateMany({
        where: { id: sale.customerId, businessId: ctx.businessId, balance: { gte: sale.total } },
        data: { balance: { decrement: sale.total } },
      })
      if (updated.count !== 1) throw new AppError("El cliente ya abonó esta deuda. Usa una devolución.")
    }
    const stockNote = stockMode === "restore" ? "Stock: devuelto al almacén" : "Stock: mantenido (sin movimiento)"
    const voidNote = `Anulada · ${reason} · ${stockNote}`
    return tx.sale.update({
      where: { id: sale.id },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        notes: sale.notes ? `${sale.notes}\n${voidNote}` : voidNote,
      },
    })
  })
}

export async function returnSale(
  ctx: TenantContext,
  input: { saleId: string; refundMethod: "CASH" | "CREDIT"; lines: { saleLineId: string; quantity: string }[] },
) {
  assertCan(ctx, "returnSale")
  if (!input.lines.length) throw new AppError("Indica qué productos regresan")
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: input.saleId, businessId: ctx.businessId, status: "COMPLETED" },
      include: { lines: { include: { returnLines: true } }, abonos: true, returns: true },
    })
    if (!sale) throw new AppError("Venta no encontrada")

    let total = 0
    const prepared = []
    for (const item of input.lines) {
      const line = sale.lines.find((entry) => entry.id === item.saleLineId)
      if (!line) throw new AppError("Línea de venta no encontrada")
      const quantity = toQtyInt(item.quantity)
      if (quantity <= 0) continue
      const returned = line.returnLines.reduce((sum, entry) => sum + entry.quantity, 0)
      if (returned + quantity > line.quantity) throw new AppError(`La devolución de ${line.description} supera lo vendido`)
      const refund = new Decimal(line.total)
        .mul(quantity)
        .mul(sale.subtotal === 0 ? 1 : sale.total)
        .div(new Decimal(line.quantity).mul(sale.subtotal === 0 ? 1 : sale.subtotal))
        .toDecimalPlaces(0)
        .toNumber()
      const baseQuantity = mulScale(quantity, line.factorToBase)
      total += refund
      prepared.push({ line, quantity, baseQuantity, total: refund })
    }
    if (!prepared.length) throw new AppError("Indica cantidades a devolver")

    const paid = sale.abonos.reduce((sum, item) => sum + item.amount, 0)
    const alreadyReturned = sale.returns.reduce((sum, item) => sum + item.total, 0)
    const remainingDue = sale.total - paid - alreadyReturned
    let debtCut = 0
    let cashOut = input.refundMethod === "CASH" ? total : 0
    if (sale.saleType === "CREDIT" && sale.customerId) {
      const customer = await tx.customer.findFirst({ where: { id: sale.customerId, businessId: ctx.businessId } })
      if (!customer) throw new AppError("Cliente no encontrado")
      debtCut = Math.min(total, Math.max(remainingDue, 0), customer.balance)
      if (input.refundMethod === "CREDIT" && total > debtCut) {
        throw new AppError("La devolución supera la deuda pendiente. Devuelve el resto en efectivo.")
      }
      cashOut = input.refundMethod === "CASH" ? total - debtCut : 0
    }
    const session = cashOut > 0
      ? await findActiveSession(ctx, tx)
      : null
    if (cashOut > 0 && !session) throw new AppError("Abre una caja para devolver efectivo")

    const saleReturn = await tx.saleReturn.create({
      data: {
        businessId: ctx.businessId,
        saleId: sale.id,
        sessionId: session?.id,
        userId: ctx.userId,
        total,
        refundMethod: input.refundMethod,
        lines: {
          create: prepared.map((item) => ({
            saleLineId: item.line.id,
            quantity: item.quantity,
            baseQuantity: item.baseQuantity,
            total: item.total,
          })),
        },
      },
    })
    for (const item of prepared) {
      await applyStock(tx, {
        businessId: ctx.businessId,
        warehouseId: sale.warehouseId,
        productId: item.line.productId,
        userId: ctx.userId,
        direction: "IN",
        type: "RETURN",
        quantity: item.baseQuantity,
        reason: "Devolución de venta",
        referenceType: "RETURN",
        referenceId: saleReturn.id,
      })
    }
    if (cashOut > 0 && session) {
      await tx.cashMovement.create({
        data: {
          businessId: ctx.businessId,
          sessionId: session.id,
          userId: ctx.userId,
          type: "EXPENSE",
          amount: cashOut,
          reason: `Devolución de venta ${sale.id.slice(-6)}`,
        },
      })
    }
    if (debtCut > 0 && sale.customerId) {
      const updated = await tx.customer.updateMany({
        where: { id: sale.customerId, businessId: ctx.businessId, balance: { gte: debtCut } },
        data: { balance: { decrement: debtCut } },
      })
      if (updated.count !== 1) throw new AppError("No se pudo descontar la deuda del cliente")
    }
    return saleReturn
  })
}

export async function getSale(ctx: TenantContext, id: string) {
  if (!can(ctx.role, "sell", ctx.grants) && !can(ctx.role, "reports", ctx.grants)) throw new AppError("No tienes permiso para esta operación")
  const sale = await prisma.sale.findFirst({
    where: { id, businessId: ctx.businessId },
    include: {
      lines: { include: { returnLines: true } },
      payments: true,
      customer: true,
      user: true,
      returns: true,
    },
  })
  if (!sale) throw new AppError("Venta no encontrada")
  return sale
}

export function saleMoney(cents: number, currency: string) {
  return { cents, text: fromMoneyInt(cents).toFixed(2), label: currency }
}
