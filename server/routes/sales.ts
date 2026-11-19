import type { Express } from "express"
import { errorMessage } from "../../lib/errors"
import { formatMoney, fromMoneyInt } from "../../lib/money"
import { prisma } from "../../lib/db"
import { resolveUnitPriceCents } from "../../lib/pricing"
import { can } from "../../lib/roles"
import { confirmSale } from "../../lib/sales"
import { currentSession } from "../../lib/cash"
import { requireApiTenant, type AuthedRequest } from "../tenant"
import { randomUUID } from "node:crypto"

export function registerSalesRoutes(app: Express) {
  app.get("/api/sales/status", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "sell", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de venta" })
        return
      }
      const session = await currentSession(ctx)
      res.json({
        currency: ctx.currency,
        cashOpen: Boolean(session),
        registerName: session?.register.name ?? null,
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/sales/products", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "sell", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de venta" })
        return
      }
      const q = String(req.query.q ?? "").trim().toLowerCase()
      const products = await prisma.product.findMany({
        where: {
          businessId: ctx.businessId,
          isActive: true,
          ...(q
            ? {
                OR: [
                  { name: { contains: q } },
                  { internalCode: { contains: q } },
                  { barcodes: { some: { code: { contains: q } } } },
                ],
              }
            : {}),
        },
        include: {
          presentations: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] },
          variants: { where: { isActive: true }, select: { id: true }, take: 1 },
        },
        orderBy: { name: "asc" },
        take: q ? 40 : 30,
      })

      res.json({
        currency: ctx.currency,
        products: products
          .filter((product) => product.variants.length === 0 && product.presentations.length > 0)
          .map((product) => {
            const presentation = product.presentations.find((item) => item.isDefault) ?? product.presentations[0]
            const unitPrice = resolveUnitPriceCents({
              product,
              presentation,
              mode: "SALE",
              listItems: null,
            })
            return {
              id: product.id,
              name: product.name,
              code: product.internalCode,
              presentationId: presentation.id,
              presentationName: presentation.name,
              unitPriceCents: unitPrice,
              unitPriceLabel: formatMoney(unitPrice, ctx.currency),
            }
          }),
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/sales/confirm", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const lines = Array.isArray(req.body?.lines) ? req.body.lines : []
      const payments = Array.isArray(req.body?.payments) ? req.body.payments : []
      const sale = await confirmSale(ctx, {
        idempotencyKey: String(req.body?.idempotencyKey ?? randomUUID()),
        mode: "SALE",
        discount: String(req.body?.discount ?? "0"),
        saleType: "CASH",
        notes: String(req.body?.notes ?? ""),
        lines: lines.map((line: { productId?: string; presentationId?: string; quantity?: string }) => ({
          productId: String(line.productId ?? ""),
          presentationId: String(line.presentationId ?? ""),
          quantity: String(line.quantity ?? "1"),
        })),
        payments: payments.map((payment: { method?: string; amount?: string; reference?: string }) => ({
          method: String(payment.method ?? "CASH"),
          amount: String(payment.amount ?? "0"),
          reference: payment.reference ? String(payment.reference) : undefined,
        })),
      })
      res.json({
        ok: true,
        saleId: sale.id,
        total: formatMoney(sale.total, ctx.currency),
        totalAmount: fromMoneyInt(sale.total).toFixed(2),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
