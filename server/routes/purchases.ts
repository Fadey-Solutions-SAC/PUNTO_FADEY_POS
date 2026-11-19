import type { Express } from "express"
import { randomUUID } from "node:crypto"
import { errorMessage } from "../../lib/errors"
import { PURCHASE_LABEL } from "../../lib/labels"
import { formatDate, formatMoney } from "../../lib/money"
import {
  createPurchase,
  listPurchases,
  listSuppliers,
  saveSupplier,
} from "../../lib/purchases"
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
          statusLabel: PURCHASE_LABEL[purchase.status] ?? purchase.status,
          total: formatMoney(purchase.total, ctx.currency),
          debt: formatMoney(purchase.total - purchase.paid, ctx.currency),
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
        receiveNow: true,
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
}
