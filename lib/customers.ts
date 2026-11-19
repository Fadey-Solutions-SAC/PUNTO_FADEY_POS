import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { toMoneyInt } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

export async function saveCustomer(
  ctx: TenantContext,
  input: {
    id?: string
    name: string
    document?: string
    phone?: string
    email?: string
    address?: string
    creditLimit?: string
    isActive?: boolean
  },
) {
  assertCan(ctx, "customers")
  const name = input.name.trim()
  if (name.length < 2) throw new AppError("Indica el nombre del cliente")
  const data = {
    name,
    document: input.document?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    creditLimit: toMoneyInt(input.creditLimit || "0"),
    isActive: input.isActive ?? true,
  }
  if (input.id) {
    const updated = await prisma.customer.updateMany({ where: { id: input.id, businessId: ctx.businessId }, data })
    if (updated.count !== 1) throw new AppError("Cliente no encontrado")
    return input.id
  }
  const created = await prisma.customer.create({ data: { ...data, businessId: ctx.businessId } })
  return created.id
}

export async function registerAbono(
  ctx: TenantContext,
  customerId: string,
  amount: string,
  saleId?: string,
  method: string = "CASH",
) {
  assertCan(ctx, "customers")
  const value = toMoneyInt(amount)
  if (value <= 0) throw new AppError("El abono debe ser mayor que cero")
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, businessId: ctx.businessId } })
    if (!customer) throw new AppError("Cliente no encontrado")
    if (customer.balance < value) throw new AppError("El abono supera la deuda")
    const session = await tx.cashSession.findFirst({
      where: { businessId: ctx.businessId, userId: ctx.userId, branchId: ctx.branchId, status: "OPEN" },
    })
    if (!session) throw new AppError("Abre una caja para cobrar")
    const openSales = await tx.sale.findMany({
      where: { businessId: ctx.businessId, customerId: customer.id, saleType: "CREDIT", status: "COMPLETED" },
      include: { abonos: true, returns: true },
      orderBy: { createdAt: "asc" },
    })
    const remainingOf = (sale: (typeof openSales)[number]) => {
      const paid = sale.abonos.reduce((sum, item) => sum + item.amount, 0)
      const returned = sale.returns.reduce((sum, item) => sum + item.total, 0)
      return sale.total - paid - returned
    }
    let left = value
    const slices: { saleId: string; amount: number }[] = []
    const ordered = saleId ? openSales.filter((sale) => sale.id === saleId) : openSales
    if (saleId && ordered.length === 0) throw new AppError("La venta a crédito no pertenece a este cliente")
    for (const sale of ordered) {
      if (left <= 0) break
      const room = remainingOf(sale)
      if (room <= 0) continue
      const slice = Math.min(room, left)
      slices.push({ saleId: sale.id, amount: slice })
      left -= slice
    }
    if (slices.reduce((sum, item) => sum + item.amount, 0) !== value) {
      throw new AppError(saleId ? "El abono supera el saldo de esa venta" : "El abono supera las ventas a crédito pendientes")
    }
    const updated = await tx.customer.updateMany({
      where: { id: customer.id, businessId: ctx.businessId, balance: { gte: value } },
      data: { balance: { decrement: value } },
    })
    if (updated.count !== 1) throw new AppError("No se pudo aplicar el abono")
    for (const slice of slices) {
      await tx.customerPayment.create({
        data: {
          businessId: ctx.businessId,
          customerId: customer.id,
          saleId: slice.saleId,
          sessionId: session.id,
          userId: ctx.userId,
          amount: slice.amount,
        },
      })
    }
    if (method === "CASH") {
      await tx.cashMovement.create({
        data: {
          businessId: ctx.businessId,
          sessionId: session.id,
          userId: ctx.userId,
          type: "INCOME",
          amount: value,
          reason: `Abono de ${customer.name}`,
        },
      })
    }
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: "ABONO",
        entity: "Customer",
        entityId: customer.id,
        detail: `${value}:${method}`,
      },
    })
  })
}

export async function listCustomers(ctx: TenantContext) {
  return prisma.customer.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { name: "asc" },
  })
}
