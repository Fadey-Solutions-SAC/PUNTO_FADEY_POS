import type { Express } from "express"
import { randomUUID } from "node:crypto"
import { AppError, errorMessage } from "../../lib/errors"
import { PURCHASE_LABEL } from "../../lib/labels"
import { formatDate, formatMoney, formatQty } from "../../lib/money"
import {
  createPurchase,
  getPurchase,
  listPurchases,
  listSuppliers,
  payPurchase,
  receivePurchase,
  saveSupplier,
} from "../../lib/purchases"
import { PAYMENT_LABEL } from "../../lib/labels"
import {
  closeOpenRequirement,
  lowStockRequirement,
  receptionList,
  saveRequirement,
} from "../../lib/requirements"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

export function registerPurchasesRoutes(app: Express) {
  app.get("/api/purchases/suppliers", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "purchases", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de compras" })
        return
      }
      const suppliers = await listSuppliers(ctx)
      res.json({
        suppliers: suppliers.map((supplier) => ({
          id: supplier.id,
          tradeName: supplier.tradeName,
          taxId: supplier.taxId ?? "",
          phone: supplier.phone ?? "",
          email: supplier.email ?? "",
          isActive: supplier.isActive,
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/purchases/suppliers", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const id = await saveSupplier(ctx, {
        tradeName: String(req.body?.tradeName ?? ""),
        legalName: req.body?.legalName != null ? String(req.body.legalName) : undefined,
        taxId: req.body?.taxId != null ? String(req.body.taxId) : undefined,
        contact: req.body?.contact != null ? String(req.body.contact) : undefined,
        phone: req.body?.phone != null ? String(req.body.phone) : undefined,
        email: req.body?.email != null ? String(req.body.email) : undefined,
        address: req.body?.address != null ? String(req.body.address) : undefined,
        isActive: req.body?.isActive !== false,
      })
      res.json({ ok: true, id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/purchases/history", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "purchases", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de compras" })
        return
      }
      const purchases = await listPurchases(ctx)
      res.json({
        currency: ctx.currency,
        purchases: purchases.map((purchase) => ({
          id: purchase.id,
          createdAtLabel: formatDate(purchase.createdAt),
          supplierName: purchase.supplier.tradeName,
          documentNumber: purchase.documentNumber ?? "—",
          status: purchase.status,
          statusLabel: PURCHASE_LABEL[purchase.status] ?? purchase.status,
          total: formatMoney(purchase.total, ctx.currency),
          debt: formatMoney(purchase.total - purchase.paid, ctx.currency),
          debtCents: purchase.status === "CANCELLED" ? 0 : purchase.total - purchase.paid,
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/purchases/requirement", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "purchases", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de compras" })
        return
      }
      const products = await lowStockRequirement(ctx)
      res.json({ warehouseName: ctx.warehouseName, products })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/purchases/requirement", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const lines = Array.isArray(req.body?.lines) ? req.body.lines : []
      await saveRequirement(
        ctx,
        lines.map((line: { productId?: string; quantity?: string }) => ({
          productId: String(line.productId ?? ""),
          quantity: String(line.quantity ?? "0"),
        })),
      )
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/purchases/reception", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "purchases", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de compras" })
        return
      }
      const [lines, suppliers] = await Promise.all([receptionList(ctx), listSuppliers(ctx)])
      res.json({
        lines,
        suppliers: suppliers
          .filter((supplier) => supplier.isActive)
          .map((supplier) => ({ id: supplier.id, tradeName: supplier.tradeName })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/purchases/reception", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const lines = Array.isArray(req.body?.lines) ? req.body.lines : []
      const purchase = await createPurchase(ctx, {
        supplierId: String(req.body?.supplierId ?? ""),
        documentNumber: req.body?.documentNumber ? String(req.body.documentNumber) : undefined,
        idempotencyKey: String(req.body?.idempotencyKey ?? randomUUID()),
        // Por defecto se recibe al registrar (como antes). receiveNow=false deja la compra pendiente.
        receiveNow: req.body?.receiveNow !== false,
        payNow: req.body?.payNow ? String(req.body.payNow) : undefined,
        payMethod: ["CASH", "TRANSFER", "OTHER"].includes(String(req.body?.payMethod))
          ? (String(req.body.payMethod) as "CASH" | "TRANSFER" | "OTHER")
          : undefined,
        lineLots: lines.map((line: { lotCode?: string; expiresAt?: string }) => ({
          lotCode: line.lotCode ? String(line.lotCode) : undefined,
          expiresAt: line.expiresAt ? String(line.expiresAt) : undefined,
        })),
        lines: lines.map(
          (line: { productId?: string; presentationId?: string; quantity?: string; unitCost?: string }) => ({
            productId: String(line.productId ?? ""),
            presentationId: line.presentationId ? String(line.presentationId) : undefined,
            quantity: String(line.quantity ?? "0"),
            unitCost: String(line.unitCost ?? "0"),
          }),
        ),
      })
      await closeOpenRequirement(ctx)
      res.json({ ok: true, id: purchase.id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
  // Cuentas por pagar: deuda por proveedor y compras pendientes de recibir.
  app.get("/api/purchases/payables", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const purchases = (await listPurchases(ctx)).filter((item) => item.status !== "CANCELLED")
      const money = (cents: number) => formatMoney(cents, ctx.currency)
      const withDebt = purchases.filter((item) => item.total - item.paid > 0)
      const bySupplier = new Map<string, { id: string; name: string; debt: number; count: number; oldest: Date }>()
      for (const item of withDebt) {
        const row = bySupplier.get(item.supplierId) ?? { id: item.supplierId, name: item.supplier.tradeName, debt: 0, count: 0, oldest: item.createdAt }
        row.debt += item.total - item.paid
        row.count += 1
        if (item.createdAt < row.oldest) row.oldest = item.createdAt
        bySupplier.set(item.supplierId, row)
      }
      const pendingReception = purchases.filter((item) => item.status === "ORDERED" || item.status === "PARTIAL")
      const rows = (list: typeof purchases) =>
        list.map((item) => ({
          id: item.id,
          createdAtLabel: formatDate(item.createdAt),
          supplierName: item.supplier.tradeName,
          documentNumber: item.documentNumber ?? "—",
          status: item.status,
          statusLabel: PURCHASE_LABEL[item.status] ?? item.status,
          total: money(item.total),
          paid: money(item.paid),
          debt: money(item.total - item.paid),
          debtCents: item.total - item.paid,
          days: Math.floor((Date.now() - item.createdAt.getTime()) / 86_400_000),
        }))
      const totalDebt = withDebt.reduce((sum, item) => sum + item.total - item.paid, 0)
      res.json({
        totalDebt: money(totalDebt),
        totalDebtCents: totalDebt,
        suppliers: [...bySupplier.values()]
          .sort((a, b) => b.debt - a.debt)
          .map((row) => ({ id: row.id, name: row.name, debt: money(row.debt), debtCents: row.debt, count: row.count, oldestLabel: formatDate(row.oldest) })),
        payables: rows([...withDebt].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())),
        pendingReception: rows(pendingReception),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/purchases/:id", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const purchase = await getPurchase(ctx, String(req.params.id))
      const money = (cents: number) => formatMoney(cents, ctx.currency)
      const debt = purchase.total - purchase.paid
      res.json({
        id: purchase.id,
        supplierName: purchase.supplier.tradeName,
        supplierTaxId: purchase.supplier.taxId ?? "",
        documentNumber: purchase.documentNumber ?? "—",
        createdAtLabel: formatDate(purchase.createdAt),
        receivedAtLabel: purchase.receivedAt ? formatDate(purchase.receivedAt) : "",
        warehouseName: purchase.warehouse.name,
        userName: purchase.user.name,
        status: purchase.status,
        statusLabel: PURCHASE_LABEL[purchase.status] ?? purchase.status,
        subtotal: money(purchase.subtotal),
        discount: money(purchase.discount),
        total: money(purchase.total),
        paid: money(purchase.paid),
        debt: money(debt),
        debtCents: debt,
        debtAmount: (debt / 100).toFixed(2),
        canReceive: purchase.status === "ORDERED" || purchase.status === "PARTIAL",
        canPay: purchase.status !== "CANCELLED" && debt > 0,
        lines: purchase.lines.map((line) => ({
          id: line.id,
          description: line.description,
          quantityLabel: formatQty(line.quantity),
          receivedLabel: formatQty(Math.round((line.receivedBase / Math.max(1, line.factorToBase)) * 10_000)),
          fullyReceived: line.receivedBase >= line.baseQuantity,
          trackLots: line.product.trackLots,
          unitCost: money(line.unitCost),
          total: money(line.total),
        })),
        payments: [...purchase.payments]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((payment) => ({
            id: payment.id,
            createdAtLabel: formatDate(payment.createdAt),
            methodLabel: PAYMENT_LABEL[payment.method] ?? payment.method,
            amount: money(payment.amount),
          })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/purchases/:id/receive", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const raw = req.body?.lots && typeof req.body.lots === "object" ? (req.body.lots as Record<string, { lotCode?: unknown; expiresAt?: unknown }>) : {}
      const lots = Object.fromEntries(
        Object.entries(raw).map(([lineId, lot]) => [
          lineId,
          { lotCode: lot?.lotCode ? String(lot.lotCode) : undefined, expiresAt: lot?.expiresAt ? String(lot.expiresAt) : undefined },
        ]),
      )
      await receivePurchase(req.tenant!, String(req.params.id), lots)
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/purchases/:id/pay", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const method = String(req.body?.method ?? "CASH")
      if (!["CASH", "TRANSFER", "OTHER"].includes(method)) throw new AppError("Medio de pago inválido")
      await payPurchase(req.tenant!, String(req.params.id), String(req.body?.amount ?? "0"), method)
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
