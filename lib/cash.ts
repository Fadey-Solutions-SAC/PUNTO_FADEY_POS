import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { toMoneyInt } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

const INCOME = new Set(["INCOME", "DEPOSIT"])
const EXPENSE = new Set(["EXPENSE", "WITHDRAWAL"])

export async function openSession(ctx: TenantContext, input: { cashRegisterId: string; openingAmount: string }) {
  assertCan(ctx, "cash")
  const mine = await prisma.cashSession.findFirst({
    where: { businessId: ctx.businessId, userId: ctx.userId, status: "OPEN" },
  })
  if (mine) throw new AppError("Ya tienes una caja abierta")
  const register = await prisma.cashRegister.findFirst({
    where: { id: input.cashRegisterId, businessId: ctx.businessId, branchId: ctx.branchId, isActive: true },
  })
  if (!register) throw new AppError("Caja no encontrada")
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: ctx.userId, businessId: ctx.businessId } },
  })
  if (membership?.cashRegisterId && membership.cashRegisterId !== register.id) throw new AppError("Solo puedes abrir tu caja")
  const busy = await prisma.cashSession.findFirst({ where: { cashRegisterId: register.id, status: "OPEN" } })
  if (busy) throw new AppError("Esa caja ya está abierta")
  return prisma.cashSession.create({
    data: {
      businessId: ctx.businessId,
      branchId: ctx.branchId,
      cashRegisterId: register.id,
      userId: ctx.userId,
      openingAmount: toMoneyInt(input.openingAmount || "0"),
      status: "OPEN",
    },
  })
}

export async function currentSession(ctx: TenantContext) {
  return prisma.cashSession.findFirst({
    where: { businessId: ctx.businessId, userId: ctx.userId, branchId: ctx.branchId, status: "OPEN" },
    include: { register: true, movements: { orderBy: { createdAt: "desc" } }, user: true },
  })
}

export async function summarizeSession(ctx: TenantContext, sessionId: string) {
  const session = await prisma.cashSession.findFirst({
    where: { id: sessionId, businessId: ctx.businessId },
    include: { movements: true, register: true, user: true },
  })
  if (!session) throw new AppError("Caja no encontrada")
  const payments = await prisma.salePayment.findMany({
    where: { sale: { sessionId: session.id, businessId: ctx.businessId, status: "COMPLETED" } },
  })
  const byMethod: Record<string, number> = { CASH: 0, CARD: 0, TRANSFER: 0, OTHER: 0, CREDIT: 0 }
  for (const payment of payments) {
    byMethod[payment.method] = (byMethod[payment.method] ?? 0) + payment.amount
  }
  const income = session.movements.filter((item) => INCOME.has(item.type)).reduce((sum, item) => sum + item.amount, 0)
  const expense = session.movements.filter((item) => EXPENSE.has(item.type)).reduce((sum, item) => sum + item.amount, 0)
  const expected = session.openingAmount + (byMethod.CASH ?? 0) + income - expense
  return { session, byMethod, income, expense, expected }
}

export async function addMovement(
  ctx: TenantContext,
  input: { type: "INCOME" | "EXPENSE" | "WITHDRAWAL" | "DEPOSIT"; amount: string; reason: string },
) {
  assertCan(ctx, "cash")
  if (input.type === "WITHDRAWAL") assertCan(ctx, "cashClose")
  if (!input.reason.trim()) throw new AppError("Indica el motivo")
  const session = await currentSession(ctx)
  if (!session) throw new AppError("No hay una caja abierta")
  const amount = toMoneyInt(input.amount)
  if (amount <= 0) throw new AppError("El monto debe ser mayor que cero")
  return prisma.cashMovement.create({
    data: {
      businessId: ctx.businessId,
      sessionId: session.id,
      userId: ctx.userId,
      type: input.type,
      amount,
      reason: input.reason.trim(),
    },
  })
}

export async function closeSession(ctx: TenantContext, input: { counted: string; notes?: string }) {
  assertCan(ctx, "cashClose")
  const current = await currentSession(ctx)
  if (!current) throw new AppError("No hay una caja abierta")
  const summary = await summarizeSession(ctx, current.id)
  const counted = toMoneyInt(input.counted || "0")
  return prisma.cashSession.updateMany({
    where: { id: current.id, businessId: ctx.businessId, status: "OPEN" },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      expectedAmount: summary.expected,
      countedAmount: counted,
      difference: counted - summary.expected,
      cashSales: summary.byMethod.CASH,
      cardSales: summary.byMethod.CARD,
      transferSales: summary.byMethod.TRANSFER,
      otherSales: summary.byMethod.OTHER,
      incomeTotal: summary.income,
      expenseTotal: summary.expense,
      notes: input.notes?.trim() || null,
    },
  })
}

export async function createRegister(ctx: TenantContext, name: string) {
  assertCan(ctx, "settings")
  const clean = name.trim()
  if (clean.length < 2) throw new AppError("Indica el nombre de la caja")
  return prisma.cashRegister.create({
    data: { businessId: ctx.businessId, branchId: ctx.branchId, name: clean },
  })
}

export async function removeRegister(ctx: TenantContext, registerId: string) {
  assertCan(ctx, "settings")
  const register = await prisma.cashRegister.findFirst({
    where: { id: registerId, businessId: ctx.businessId, isActive: true },
  })
  if (!register) throw new AppError("Caja no encontrada")
  const open = await prisma.cashSession.findFirst({ where: { cashRegisterId: register.id, status: "OPEN" } })
  if (open) throw new AppError("Esa caja está abierta. Ciérrala antes de eliminarla")
  const sessions = await prisma.cashSession.count({ where: { cashRegisterId: register.id } })
  await prisma.membership.updateMany({ where: { cashRegisterId: register.id }, data: { cashRegisterId: null } })
  if (sessions === 0) {
    await prisma.cashRegister.delete({ where: { id: register.id } })
    return
  }
  await prisma.cashRegister.update({ where: { id: register.id }, data: { isActive: false } })
}

export async function listSessions(ctx: TenantContext) {
  return prisma.cashSession.findMany({
    where: { businessId: ctx.businessId },
    include: { register: true, user: true, branch: true },
    orderBy: { openedAt: "desc" },
    take: 100,
  })
}
