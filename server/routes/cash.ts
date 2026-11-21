import type { Express } from "express"
import {
  addMovement,
  closeSession,
  currentSession,
  listSessions,
  openSession,
  summarizeSession,
} from "../../lib/cash"
import { CASH_DENOMS, denomTotalCents } from "../../lib/denominations"
import { errorMessage } from "../../lib/errors"
import { CASH_LABEL } from "../../lib/labels"
import { formatDate, limaDay, formatMoney, fromMoneyInt } from "../../lib/money"
import { readTheme } from "../../lib/appearance"
import { brandLogoUrl } from "../../lib/cover"
import { dashboardData } from "../../lib/dashboard"
import { listPaymentMethods, paymentMethodLabels } from "../../lib/payment-methods"
import { prisma } from "../../lib/db"
import { APP_VERSION, listNotices } from "../../lib/notices"
import { can, ROLE_LABEL, type Role } from "../../lib/roles"
import { formatQty } from "../../lib/money"
import { PAYMENT_LABEL } from "../../lib/labels"
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
      const [theme, logo, notices] = await Promise.all([
        readTheme(ctx.businessId),
        brandLogoUrl(ctx.businessId),
        listNotices(ctx),
      ])
      res.json({
        user: {
          id: ctx.userId,
          name: ctx.userName,
          role: ctx.role,
          roleLabel: ROLE_LABEL[ctx.role as Role] ?? ctx.role,
          detail: `${ctx.branchName} · ${ctx.warehouseName}`,
          configMode: ctx.configMode === true,
        },
        business: {
          id: ctx.businessId,
          name: ctx.businessName,
          currency: ctx.currency,
        },
        branch: { id: ctx.branchId, name: ctx.branchName },
        warehouse: { id: ctx.warehouseId, name: ctx.warehouseName },
        theme,
        logo,
        version: APP_VERSION,
        notices: notices.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          detail: item.detail,
          href: item.href,
        })),
        nav: navigation(ctx.role, ctx.grants),
        permissions: {
          cash: can(ctx.role, "cash", ctx.grants),
          cashClose: can(ctx.role, "cashClose", ctx.grants),
          sell: can(ctx.role, "sell", ctx.grants),
          voidSale: can(ctx.role, "voidSale", ctx.grants),
          purchases: can(ctx.role, "purchases", ctx.grants),
          reports: can(ctx.role, "reports", ctx.grants),
          catalogWrite: can(ctx.role, "catalogWrite", ctx.grants),
        },
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/panel/dashboard", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const [data, payLabels] = await Promise.all([dashboardData(ctx), paymentMethodLabels(ctx)])
      const boxes = await Promise.all(data.openSessions.map((session) => summarizeSession(ctx, session.id)))
      res.json({
        currency: ctx.currency,
        salesTotal: moneyOut(data.salesTotal, ctx.currency),
        operations: data.operations,
        yesterdaySales: moneyOut(data.yesterdaySales, ctx.currency),
        yesterdayOperations: data.yesterdayOperations,
        income: moneyOut(data.income, ctx.currency),
        expense: moneyOut(data.expense, ctx.currency),
        profit: moneyOut(data.profit, ctx.currency),
        lossesToday: moneyOut(data.lossesToday, ctx.currency),
        products: data.products,
        low: data.low,
        empty: data.empty,
        payMix: Object.fromEntries(
          Object.entries(data.payMix).map(([method, cents]) => [
            method,
            { ...moneyOut(cents, ctx.currency), label: payLabels[method] ?? PAYMENT_LABEL[method] ?? method },
          ]),
        ),
        days: data.days.map((day) => ({ label: day.label, total: moneyOut(day.total, ctx.currency) })),
        attention: data.attention.map((item) => ({
          name: item.name,
          quantityLabel: formatQty(item.quantity),
          minStockLabel: formatQty(item.minStock),
        })),
        openBoxes: boxes.map((box) => ({
          id: box.session.id,
          registerName: box.session.register.name,
          userName: box.session.user.name,
          opening: moneyOut(box.session.openingAmount, ctx.currency),
          cashSales: moneyOut(box.byMethod.CASH ?? 0, ctx.currency),
          income: moneyOut(box.income, ctx.currency),
          expense: moneyOut(box.expense, ctx.currency),
          expected: moneyOut(box.expected, ctx.currency),
        })),
        lastSales: data.lastSales.map((sale) => ({
          id: sale.id,
          code: sale.id.slice(-6).toUpperCase(),
          customerName: sale.customer?.name ?? "Público",
          total: moneyOut(sale.total, ctx.currency),
          payments: sale.payments
            .map((payment) => payLabels[payment.method] ?? PAYMENT_LABEL[payment.method] ?? payment.method)
            .join(", ") || "—",
        })),
        lastPurchases: data.lastPurchases.map((purchase) => ({
          id: purchase.id,
          supplierName: purchase.supplier.tradeName,
          total: moneyOut(purchase.total, ctx.currency),
        })),
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
          day: limaDay(row.openedAt),
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

  app.get("/api/cash/close-preview", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "cashClose", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de cierre" })
        return
      }
      const session = await currentSession(ctx)
      if (!session) {
        res.status(400).json({ error: "No hay una caja abierta" })
        return
      }
      const [summary, methods] = await Promise.all([summarizeSession(ctx, session.id), listPaymentMethods(ctx)])
      const labels = Object.fromEntries(methods.map((item) => [item.code, item.label]))
      const posRows = Object.entries(summary.byMethod)
        .filter(([code, amount]) => code !== "CASH" && code !== "CREDIT" && amount > 0)
        .map(([code, expected]) => ({
          code,
          label: labels[code] ?? code,
          expected: moneyOut(expected, ctx.currency),
        }))
      const [sales, returns] = await Promise.all([
        prisma.sale.findMany({
          where: { businessId: ctx.businessId, sessionId: session.id, status: { in: ["COMPLETED", "VOIDED"] } },
          select: { status: true, total: true, saleType: true },
        }),
        prisma.saleReturn.findMany({ where: { businessId: ctx.businessId, sessionId: session.id }, select: { total: true, refundMethod: true } }),
      ])
      const completed = sales.filter((sale) => sale.status === "COMPLETED")
      const sum = (rows: { total: number }[]) => rows.reduce((total, row) => total + row.total, 0)
      res.json({
        currency: ctx.currency,
        denoms: CASH_DENOMS,
        registerName: session.register.name,
        userName: summary.session.user.name,
        openedAtLabel: formatDate(summary.session.openedAt),
        shift: {
          salesCount: completed.length,
          salesTotal: moneyOut(sum(completed), ctx.currency),
          creditTotal: moneyOut(sum(completed.filter((sale) => sale.saleType === "CREDIT")), ctx.currency),
          voidedCount: sales.length - completed.length,
          voidedTotal: moneyOut(sum(sales.filter((sale) => sale.status === "VOIDED")), ctx.currency),
          returnsCount: returns.length,
          returnsTotal: moneyOut(sum(returns), ctx.currency),
          movements: summary.session.movements.map((movement) => ({
            id: movement.id,
            typeLabel: CASH_LABEL[movement.type] ?? movement.type,
            reason: movement.reason ?? "",
            amount: moneyOut(movement.amount, ctx.currency),
            out: movement.type === "EXPENSE" || movement.type === "WITHDRAWAL",
            atLabel: formatDate(movement.createdAt),
          })),
        },
        opening: moneyOut(summary.session.openingAmount, ctx.currency),
        expectedCash: moneyOut(summary.expected, ctx.currency),
        income: moneyOut(summary.income, ctx.currency),
        expense: moneyOut(summary.expense, ctx.currency),
        byMethod: Object.fromEntries(
          Object.entries(summary.byMethod).map(([method, amount]) => [method, moneyOut(amount, ctx.currency)]),
        ),
        posRows,
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/cash/close", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      let counted = String(req.body?.counted ?? "").trim()
      const denoms = req.body?.denominations
      if ((!counted || counted === "0") && denoms && typeof denoms === "object") {
        counted = fromMoneyInt(denomTotalCents(denoms as Record<string, string>)).toFixed(2)
      }
      // Confirmación de los otros medios (Yape, tarjeta, transferencia…): se guarda en el detalle del cierre.
      const methodCounts = req.body?.methodCounts && typeof req.body.methodCounts === "object" ? (req.body.methodCounts as Record<string, string>) : {}
      let methodDetail = ""
      if (Object.keys(methodCounts).length) {
        const session = await currentSession(ctx)
        if (session) {
          const [summary, methods] = await Promise.all([summarizeSession(ctx, session.id), listPaymentMethods(ctx)])
          const labels = Object.fromEntries(methods.map((item) => [item.code, item.label]))
          methodDetail = Object.entries(methodCounts)
            .map(([code, value]) => {
              const expected = summary.byMethod[code] ?? 0
              const confirmed = Math.round(Number(String(value).replace(",", ".")) * 100) || 0
              const diff = confirmed - expected
              return `${labels[code] ?? code}: confirmado ${fromMoneyInt(confirmed).toFixed(2)} · esperado ${fromMoneyInt(expected).toFixed(2)}${diff ? ` · diferencia ${fromMoneyInt(diff).toFixed(2)}` : " · cuadra"}`
            })
            .join("\n")
        }
      }
      await closeSession(ctx, {
        counted,
        notes: String(req.body?.notes ?? ""),
        arqueoDetail: [String(req.body?.arqueoDetail ?? ""), methodDetail ? `Otros medios:\n${methodDetail}` : ""].filter(Boolean).join("\n"),
      })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
