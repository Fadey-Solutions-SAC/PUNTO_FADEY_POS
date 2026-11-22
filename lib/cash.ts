import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { toMoneyInt } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

const INCOME = new Set(["INCOME", "DEPOSIT"])
const EXPENSE = new Set(["EXPENSE", "WITHDRAWAL"])

type Tx = Prisma.TransactionClient

/**
 * Cajas físicas: cada caja tiene a lo más una sesión abierta, compartida por quienes trabajan en ella.
 * El cajero trabaja solo en la caja que tiene asignada; el dueño y el administrador pueden entrar a cualquiera.
 * La caja en la que está cada usuario es la de su membresía (`cashRegisterId`).
 */
export function hasFullCashAccess(ctx: TenantContext) {
  return ctx.role === "OWNER" || ctx.role === "ADMIN" || ctx.configMode === true
}

async function membershipOf(ctx: TenantContext, tx: Tx | typeof prisma = prisma) {
  return tx.membership.findUnique({ where: { userId_businessId: { userId: ctx.userId, businessId: ctx.businessId } } })
}

/** ¿Puede este usuario trabajar en esa caja? */
function mayUse(ctx: TenantContext, assigned: string | null | undefined, registerId: string) {
  return hasFullCashAccess(ctx) || !assigned || assigned === registerId
}

/** Sesión abierta de la caja en la que está el usuario (sin importar quién la abrió). */
export async function findActiveSession(ctx: TenantContext, tx: Tx | typeof prisma = prisma) {
  const membership = await membershipOf(ctx, tx)
  if (membership?.cashRegisterId) {
    return tx.cashSession.findFirst({
      where: { businessId: ctx.businessId, cashRegisterId: membership.cashRegisterId, status: "OPEN" },
    })
  }
  // Sin caja elegida: la que abrió él mismo (comportamiento anterior).
  return tx.cashSession.findFirst({
    where: { businessId: ctx.businessId, userId: ctx.userId, branchId: ctx.branchId, status: "OPEN" },
  })
}

export async function openSession(ctx: TenantContext, input: { cashRegisterId: string; openingAmount: string }) {
  assertCan(ctx, "cash")
  const register = await prisma.cashRegister.findFirst({
    where: { id: input.cashRegisterId, businessId: ctx.businessId, branchId: ctx.branchId, isActive: true },
  })
  if (!register) throw new AppError("Caja no encontrada")
  const membership = await membershipOf(ctx)
  if (!mayUse(ctx, membership?.cashRegisterId, register.id)) throw new AppError("Solo puedes abrir la caja que tienes asignada")
  const busy = await prisma.cashSession.findFirst({ where: { cashRegisterId: register.id, status: "OPEN" } })
  if (busy) throw new AppError("Esa caja ya está abierta: usa «Entrar»")
  const session = await prisma.cashSession.create({
    data: {
      businessId: ctx.businessId,
      branchId: ctx.branchId,
      cashRegisterId: register.id,
      userId: ctx.userId,
      openingAmount: toMoneyInt(input.openingAmount || "0"),
      status: "OPEN",
    },
  })
  // Quien abre queda trabajando en esa caja.
  if (membership && membership.cashRegisterId !== register.id) {
    await prisma.membership.update({ where: { id: membership.id }, data: { cashRegisterId: register.id } })
  }
  return session
}

/** Entrar a una caja: el dueño y el administrador pueden cambiar a cualquiera; el cajero solo a la suya. */
export async function enterRegister(ctx: TenantContext, registerId: string) {
  if (!hasFullCashAccess(ctx)) assertCan(ctx, "sell")
  const register = await prisma.cashRegister.findFirst({
    where: { id: registerId, businessId: ctx.businessId, branchId: ctx.branchId, isActive: true },
  })
  if (!register) throw new AppError("Caja no encontrada")
  const membership = await membershipOf(ctx)
  if (!membership) throw new AppError("Usuario sin acceso a este negocio")
  if (!mayUse(ctx, membership.cashRegisterId, register.id)) throw new AppError("Solo puedes entrar a la caja que tienes asignada")
  if (membership.cashRegisterId !== register.id) {
    await prisma.membership.update({ where: { id: membership.id }, data: { cashRegisterId: register.id } })
  }
  return register
}

/** Cajas de la sucursal con su estado, para el panel de caja. */
export async function registerBoard(ctx: TenantContext) {
  const [registers, membership] = await Promise.all([
    prisma.cashRegister.findMany({
      where: { businessId: ctx.businessId, branchId: ctx.branchId, isActive: true },
      include: { sessions: { where: { status: "OPEN" }, include: { user: { select: { name: true } } }, take: 1 } },
      orderBy: { name: "asc" },
    }),
    membershipOf(ctx),
  ])
  const users = await prisma.membership.findMany({
    where: { businessId: ctx.businessId, cashRegisterId: { in: registers.map((item) => item.id) }, user: { email: { not: "configuracion@interno.fadey" } } },
    include: { user: { select: { name: true } } },
  })
  return {
    fullAccess: hasFullCashAccess(ctx),
    currentRegisterId: membership?.cashRegisterId ?? null,
    registers: registers.map((register) => {
      const open = register.sessions[0] ?? null
      return {
        id: register.id,
        name: register.name,
        open: Boolean(open),
        openedBy: open?.user.name ?? null,
        openedAt: open?.openedAt ?? null,
        accessible: mayUse(ctx, membership?.cashRegisterId && !hasFullCashAccess(ctx) ? membership.cashRegisterId : null, register.id),
        current: membership?.cashRegisterId === register.id,
        people: users.filter((item) => item.cashRegisterId === register.id).map((item) => item.user.name),
      }
    }),
  }
}

export async function currentSession(ctx: TenantContext) {
  const active = await findActiveSession(ctx)
  if (!active) return null
  return prisma.cashSession.findFirst({
    where: { id: active.id },
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

export async function closeSession(
  ctx: TenantContext,
  input: {
    counted: string
    notes?: string
    arqueoDetail?: string
  },
) {
  assertCan(ctx, "cashClose")
  const current = await currentSession(ctx)
  if (!current) throw new AppError("No hay una caja abierta")
  const summary = await summarizeSession(ctx, current.id)
  const counted = toMoneyInt(input.counted || "0")
  const noteParts = [input.notes?.trim(), input.arqueoDetail?.trim()].filter(Boolean)
  return prisma.cashSession.updateMany({
    where: { id: current.id, businessId: ctx.businessId, status: "OPEN" },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      expectedAmount: summary.expected,
      countedAmount: counted,
      difference: counted - summary.expected,
      cashSales: summary.byMethod.CASH ?? 0,
      cardSales: summary.byMethod.CARD ?? 0,
      transferSales: summary.byMethod.TRANSFER ?? 0,
      otherSales: Object.entries(summary.byMethod)
        .filter(([method]) => method !== "CASH" && method !== "CARD" && method !== "TRANSFER" && method !== "CREDIT")
        .reduce((sum, [, amount]) => sum + amount, 0),
      incomeTotal: summary.income,
      expenseTotal: summary.expense,
      notes: noteParts.length ? noteParts.join("\n") : null,
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
