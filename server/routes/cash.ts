import type { Express } from "express"
import {
  addMovement,
  currentSession,
  listSessions,
  openSession,
  summarizeSession,
} from "../../lib/cash"
import { errorMessage } from "../../lib/errors"
import { CASH_LABEL } from "../../lib/labels"
import { formatDate, formatMoney, fromMoneyInt } from "../../lib/money"
import { prisma } from "../../lib/db"
import { can } from "../../lib/roles"
import { navigation } from "../../lib/nav"
import { requireApiTenant, type AuthedRequest } from "../tenant"

function moneyOut(amount: number, currency: string) {
  return {
    cents: amount,
    label: formatMoney(amount, currency),
    amount: fromMoneyInt(amount).toFixed(2),
  }
}

export function registerCashRoutes(app: Express) {
  app.get("/api/panel/bootstrap", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      res.json({
        user: {
          id: ctx.userId,
          name: ctx.userName,
          role: ctx.role,
          configMode: ctx.configMode === true,
        },
        business: {
          id: ctx.businessId,
          name: ctx.businessName,
          currency: ctx.currency,
        },
        branch: { id: ctx.branchId, name: ctx.branchName },
        warehouse: { id: ctx.warehouseId, name: ctx.warehouseName },
        nav: navigation(ctx.role, ctx.grants),
        permissions: {
          cash: can(ctx.role, "cash", ctx.grants),
          cashClose: can(ctx.role, "cashClose", ctx.grants),
          sell: can(ctx.role, "sell", ctx.grants),
        },
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/cash/status", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "cash", ctx.grants) && !can(ctx.role, "sell", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de caja" })
        return
      }
      const [session, registers] = await Promise.all([
        currentSession(ctx),
        prisma.cashRegister.findMany({
          where: { businessId: ctx.businessId, branchId: ctx.branchId, isActive: true },
          orderBy: { name: "asc" },
        }),
      ])
      const membership = await prisma.membership.findUnique({
        where: { userId_businessId: { userId: ctx.userId, businessId: ctx.businessId } },
      })
      const summary = session ? await summarizeSession(ctx, session.id) : null
      res.json({
        currency: ctx.currency,
        assignedRegisterId: membership?.cashRegisterId ?? null,
        registers: registers.map((item) => ({ id: item.id, name: item.name })),
        session: session
          ? {
              id: session.id,
              registerName: session.register.name,
              openedAt: session.openedAt.toISOString(),
              opening: moneyOut(session.openingAmount, ctx.currency),
              expected: summary ? moneyOut(summary.expected, ctx.currency) : null,
              byMethod: summary
                ? Object.fromEntries(
                    Object.entries(summary.byMethod).map(([method, amount]) => [
                      method,
                      moneyOut(amount, ctx.currency),
                    ]),
                  )
                : {},
              income: summary ? moneyOut(summary.income, ctx.currency) : null,
              expense: summary ? moneyOut(summary.expense, ctx.currency) : null,
              movements: session.movements.map((movement) => ({
                id: movement.id,
                type: movement.type,
                typeLabel: CASH_LABEL[movement.type] ?? movement.type,
                reason: movement.reason,
                createdAt: movement.createdAt.toISOString(),
                createdAtLabel: formatDate(movement.createdAt),
                amount: moneyOut(movement.amount, ctx.currency),
              })),
            }
          : null,
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/cash/open", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const session = await openSession(ctx, {
        cashRegisterId: String(req.body?.cashRegisterId ?? ""),
        openingAmount: String(req.body?.openingAmount ?? "0"),
      })
      res.json({ ok: true, sessionId: session.id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/cash/movement", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const type = String(req.body?.type ?? "INCOME") as "INCOME" | "EXPENSE" | "WITHDRAWAL" | "DEPOSIT"
      const movement = await addMovement(ctx, {
        type,
        amount: String(req.body?.amount ?? ""),
        reason: String(req.body?.reason ?? ""),
      })
      res.json({ ok: true, movementId: movement.id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/cash/history", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "cash", ctx.grants) && !can(ctx.role, "cashClose", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso" })
        return
      }
      const rows = await listSessions(ctx)
      res.json({
        currency: ctx.currency,
        sessions: rows.map((row) => ({
          id: row.id,
          status: row.status,
          registerName: row.register.name,
          userName: row.user.name,
          branchName: row.branch.name,
          openedAt: row.openedAt.toISOString(),
          openedAtLabel: formatDate(row.openedAt),
          closedAt: row.closedAt?.toISOString() ?? null,
          opening: moneyOut(row.openingAmount, ctx.currency),
          expected: row.expectedAmount != null ? moneyOut(row.expectedAmount, ctx.currency) : null,
          counted: row.countedAmount != null ? moneyOut(row.countedAmount, ctx.currency) : null,
          difference: row.difference != null ? moneyOut(row.difference, ctx.currency) : null,
        })),
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })
}
