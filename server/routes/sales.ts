import type { Express } from "express"
import { randomUUID } from "node:crypto"
import { currentSession } from "../../lib/cash"
import { errorMessage } from "../../lib/errors"
import { formatDate, formatMoney, formatQty, fromMoneyInt, QTY_SCALE } from "../../lib/money"
import { listPaymentMethods } from "../../lib/payment-methods"
import { prisma } from "../../lib/db"
import { readPosSettings } from "../../lib/pos-settings"
import { resolveUnitPriceCents } from "../../lib/pricing"
import { can } from "../../lib/roles"
import { PAYMENT_LABEL } from "../../lib/labels"
import { confirmSale, getSale, returnSale, voidSale } from "../../lib/sales"
import { buildTicketText, type TicketSale } from "../../lib/ticket-text"
import { requireApiTenant, type AuthedRequest } from "../tenant"

export function registerSalesRoutes(app: Express) {
  app.get("/api/sales/status", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "sell", ctx.grants) && !can(ctx.role, "cash", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de venta" })
        return
      }
      const [session, methods, pos, categories] = await Promise.all([
        currentSession(ctx),
        listPaymentMethods(ctx),
        readPosSettings(ctx.businessId),
        prisma.category.findMany({
          where: { businessId: ctx.businessId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ])
      const accesses = [
        can(ctx.role, "sell", ctx.grants) ? { href: "/ventas/historial", label: "Historial ventas" } : null,
        can(ctx.role, "cash", ctx.grants) ? { href: "/caja", label: "Movimientos" } : null,
        can(ctx.role, "cash", ctx.grants) ? { href: "/caja/historial", label: "Historial caja" } : null,
        can(ctx.role, "cashClose", ctx.grants) ? { href: "/caja/cierre", label: "Cierre" } : null,
      ].filter((item): item is { href: string; label: string } => item !== null)

      res.json({
        currency: ctx.currency,
        cashOpen: Boolean(session),
        registerName: session?.register.name ?? null,
        openedAtLabel: session ? formatDate(session.openedAt) : null,
        openingLabel: session ? formatMoney(session.openingAmount, ctx.currency) : null,
        discountLimitPct: ctx.discountLimitPct,
        hardwareReader: pos.hardwareReader,
        canSell: can(ctx.role, "sell", ctx.grants),
        // Venta a crédito: el negocio debe tenerla activa y el usuario el permiso.
        allowCredit: ctx.allowCredit,
        canCredit: ctx.allowCredit && can(ctx.role, "credit", ctx.grants),
        canCreateCustomer: can(ctx.role, "customers", ctx.grants),
        categories,
        accesses,
        methods: methods
          .filter((item) => item.code !== "CREDIT")
          .map((item) => ({ code: item.code, label: item.label })),
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/sales/lookup", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "sell", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de venta" })
        return
      }
      const code = String(req.query.code ?? "").trim()
      if (!code) {
        res.status(400).json({ error: "Código vacío" })
        return
      }
      const product = await prisma.product.findFirst({
        where: {
          businessId: ctx.businessId,
          isActive: true,
          OR: [{ internalCode: code }, { barcodes: { some: { code } } }],
        },
        include: {
          presentations: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] },
          barcodes: { where: { code }, take: 1 },
        },
      })
      if (!product || product.presentations.length === 0) {
        res.json({ product: null })
        return
      }
      const fromBarcode = product.barcodes[0]?.presentationId
      const presentation =
        product.presentations.find((item) => item.id === fromBarcode) ??
        product.presentations.find((item) => item.isDefault) ??
        product.presentations[0]
      const unitPrice = resolveUnitPriceCents({
        product,
        presentation,
        mode: "SALE",
        listItems: null,
      })
      res.json({
        product: {
          id: product.id,
          name: product.name,
          code: product.internalCode,
          presentationId: presentation.id,
          presentationName: presentation.name,
          unitPriceCents: unitPrice,
          unitPriceLabel: formatMoney(unitPrice, ctx.currency),
        },
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
      const categoryId = String(req.query.categoryId ?? "").trim()
      const products = await prisma.product.findMany({
        where: {
          businessId: ctx.businessId,
          isActive: true,
          parentId: null,
          ...(categoryId ? { categoryId } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q } },
                  { internalCode: { contains: q } },
                  { barcodes: { some: { code: { contains: q } } } },
                  { variants: { some: { name: { contains: q }, isActive: true } } },
                ],
              }
            : {}),
        },
        include: {
          presentations: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] },
          barcodes: { select: { code: true } },
          variants: {
            where: { isActive: true },
            include: {
              presentations: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] },
              barcodes: { select: { code: true } },
            },
            orderBy: { name: "asc" },
          },
          baseUnit: { select: { symbol: true } },
        },
        orderBy: { name: "asc" },
        take: q ? 40 : 40,
      })

      const list = products.flatMap((product) => {
          if (product.variants.length > 0) {
            return product.variants
              .filter((variant) => variant.presentations.length > 0)
              .map((variant) => {
                const presentation =
                  variant.presentations.find((item) => item.isDefault) ?? variant.presentations[0]
                const unitPrice = resolveUnitPriceCents({
                  product: variant,
                  presentation,
                  mode: "SALE",
                  listItems: null,
                })
                return {
                  id: variant.id,
                  name: `${product.name} · ${variant.variantName || variant.name}`,
                  code: variant.internalCode,
                  presentationId: presentation.id,
                  presentationName: presentation.name,
                  unitPriceCents: unitPrice,
                  unitPriceLabel: formatMoney(unitPrice, ctx.currency),
                  categoryId: product.categoryId,
                  unit: product.baseUnit.symbol,
                  imagePath: variant.imagePath ?? product.imagePath ?? null,
                  // Para escanear sin conexión con la copia local del catálogo.
                  barcodes: variant.barcodes.map((item) => item.code),
                }
              })
          }
          if (product.presentations.length === 0) return []
          const presentation = product.presentations.find((item) => item.isDefault) ?? product.presentations[0]
          const unitPrice = resolveUnitPriceCents({
            product,
            presentation,
            mode: "SALE",
            listItems: null,
          })
          return [
            {
              id: product.id,
              name: product.name,
              code: product.internalCode,
              presentationId: presentation.id,
              presentationName: presentation.name,
              unitPriceCents: unitPrice,
              unitPriceLabel: formatMoney(unitPrice, ctx.currency),
              categoryId: product.categoryId,
              unit: product.baseUnit.symbol,
              imagePath: product.imagePath ?? null,
              barcodes: product.barcodes.map((item) => item.code),
            },
          ]
        })
      const balances = list.length
        ? await prisma.stockBalance.findMany({
            where: {
              businessId: ctx.businessId,
              warehouseId: ctx.warehouseId,
              productId: { in: list.map((item) => item.id) },
            },
            select: { productId: true, quantity: true },
          })
        : []
      const stockById = new Map(balances.map((row) => [row.productId, row.quantity]))
      res.json({
        currency: ctx.currency,
        products: list.map((item) => {
          const quantity = stockById.get(item.id) ?? 0
          return { ...item, stock: quantity / QTY_SCALE, stockLabel: formatQty(quantity) }
        }),
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // Clientes para elegir al vender (solo los datos necesarios; basta el permiso de venta).
  app.get("/api/sales/customers", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "sell", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de venta" })
        return
      }
      const q = String(req.query.q ?? "").trim()
      const customers = await prisma.customer.findMany({
        where: {
          businessId: ctx.businessId,
          isActive: true,
          ...(q ? { OR: [{ name: { contains: q } }, { document: { contains: q } }, { phone: { contains: q } }] } : {}),
        },
        orderBy: { name: "asc" },
        take: 30,
      })
      res.json({
        customers: customers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          document: customer.document ?? "",
          phone: customer.phone ?? "",
          balanceCents: customer.balance,
          balance: formatMoney(customer.balance, ctx.currency),
          limitCents: customer.creditLimit,
          limit: customer.creditLimit > 0 ? formatMoney(customer.creditLimit, ctx.currency) : "Sin límite",
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/sales/history", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "sell", ctx.grants) && !can(ctx.role, "reports", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso" })
        return
      }
      const onlyVoided = String(req.query.status ?? "") === "VOIDED"
      const sales = await prisma.sale.findMany({
        where: {
          businessId: ctx.businessId,
          status: onlyVoided ? "VOIDED" : { not: "DRAFT" },
        },
        include: { user: true, customer: true, payments: true },
        orderBy: { createdAt: "desc" },
        take: 150,
      })
      const methods = await listPaymentMethods(ctx)
      const labels = Object.fromEntries(methods.map((item) => [item.code, item.label]))
      res.json({
        currency: ctx.currency,
        canVoid: can(ctx.role, "voidSale", ctx.grants),
        sales: sales.map((sale) => ({
          id: sale.id,
          code: sale.id.slice(-6).toUpperCase(),
          status: sale.status,
          statusLabel: sale.status === "VOIDED" ? "Anulada" : "Confirmada",
          createdAt: sale.createdAt.toISOString(),
          createdAtLabel: formatDate(sale.createdAt),
          customerName: sale.customer?.name ?? "Público",
          userName: sale.user.name,
          total: formatMoney(sale.total, ctx.currency),
          payments: sale.payments
            .map((payment) => labels[payment.method] ?? PAYMENT_LABEL[payment.method] ?? payment.method)
            .join(", "),
        })),
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
      const saleType = req.body?.saleType === "CREDIT" ? "CREDIT" : "CASH"
      const customerId = req.body?.customerId ? String(req.body.customerId) : undefined
      const sale = await confirmSale(ctx, {
        idempotencyKey: String(req.body?.idempotencyKey ?? randomUUID()),
        mode: "SALE",
        discount: String(req.body?.discount ?? "0"),
        saleType,
        customerId,
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

  app.get("/api/sales/:id", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const sale = await getSale(ctx, String(req.params.id))
      const methods = await listPaymentMethods(ctx)
      const labels = Object.fromEntries(methods.map((item) => [item.code, item.label]))
      res.json({
        id: sale.id,
        code: sale.id.slice(-6).toUpperCase(),
        status: sale.status,
        statusLabel: sale.status === "VOIDED" ? "Anulada" : sale.status === "COMPLETED" ? "Confirmada" : sale.status,
        createdAtLabel: formatDate(sale.createdAt),
        customerName: sale.customer?.name ?? "Público",
        userName: sale.user.name,
        notes: sale.notes,
        currency: ctx.currency,
        subtotal: formatMoney(sale.subtotal, ctx.currency),
        discount: formatMoney(sale.discount, ctx.currency),
        total: formatMoney(sale.total, ctx.currency),
        canVoid: can(ctx.role, "voidSale", ctx.grants) && sale.status === "COMPLETED",
        lines: sale.lines.map((line) => ({
          id: line.id,
          description: line.description,
          quantityLabel: formatQty(line.quantity),
          unitPrice: formatMoney(line.unitPrice, ctx.currency),
          total: formatMoney(line.total, ctx.currency),
        })),
        payments: sale.payments.map((payment) => ({
          method: payment.method,
          label: labels[payment.method] ?? PAYMENT_LABEL[payment.method] ?? payment.method,
          amount: formatMoney(payment.amount, ctx.currency),
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/sales/:id/void", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const stockMode = String(req.body?.stockMode ?? "restore") === "keep" ? "keep" : "restore"
      await voidSale(ctx, String(req.params.id), String(req.body?.reason ?? ""), stockMode)
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/sales/:id/return", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "returnSale", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de devoluciones" })
        return
      }
      const sale = await getSale(ctx, String(req.params.id))
      if (sale.status !== "COMPLETED") {
        res.status(400).json({ error: "Esa venta no está confirmada" })
        return
      }
      const lines = sale.lines
        .map((line) => {
          const returned = line.returnLines.reduce((sum, item) => sum + item.quantity, 0)
          const remaining = line.quantity - returned
          return {
            id: line.id,
            description: line.description,
            remaining,
            remainingLabel: formatQty(remaining),
          }
        })
        .filter((line) => line.remaining > 0)
      res.json({
        saleId: sale.id,
        code: sale.id.slice(-6).toUpperCase(),
        credit: sale.saleType === "CREDIT",
        customerName: sale.customer?.name ?? "Público",
        lines,
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/sales/:id/return", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const refundMethod = String(req.body?.refundMethod ?? "CASH") === "CREDIT" ? "CREDIT" : "CASH"
      const lines = Array.isArray(req.body?.lines) ? req.body.lines : []
      await returnSale(ctx, {
        saleId: String(req.params.id),
        refundMethod,
        lines: lines.map((line: { saleLineId?: string; quantity?: string }) => ({
          saleLineId: String(line.saleLineId ?? ""),
          quantity: String(line.quantity ?? "0"),
        })),
      })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/sales/:id/ticket", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const sale = await getSale(ctx, String(req.params.id))
      const [business, methods] = await Promise.all([
        prisma.business.findFirst({ where: { id: ctx.businessId } }),
        listPaymentMethods(ctx),
      ])
      const labels = Object.fromEntries(methods.map((item) => [item.code, item.label]))
      const ticket: TicketSale = {
        businessName: business?.name || ctx.businessName,
        legalName: business?.legalName,
        taxId: business?.taxId,
        address: null,
        code: sale.id.slice(-6).toUpperCase(),
        createdAt: sale.createdAt,
        cashier: sale.user.name,
        customer: sale.customer?.name ?? null,
        currency: ctx.currency,
        lines: sale.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.total,
        })),
        subtotal: sale.subtotal,
        discount: sale.discount,
        total: sale.total,
        payments: sale.payments.map((payment) => ({
          label: labels[payment.method] ?? payment.method,
          amount: payment.amount,
        })),
        voided: sale.status === "VOIDED",
      }
      const width = Number(req.query.width ?? 58)
      res.json({
        saleId: sale.id,
        code: ticket.code,
        currency: ctx.currency,
        subtotal: formatMoney(sale.subtotal, ctx.currency),
        discount: formatMoney(sale.discount, ctx.currency),
        total: formatMoney(sale.total, ctx.currency),
        text: buildTicketText(ticket, Number.isFinite(width) ? width : 58),
        lines: ticket.lines.map((line) => ({
          description: line.description,
          quantityLabel: formatQty(line.quantity),
          unitPrice: formatMoney(line.unitPrice, ctx.currency),
          total: formatMoney(line.total, ctx.currency),
        })),
        payments: ticket.payments.map((payment) => ({
          label: payment.label,
          amount: formatMoney(payment.amount, ctx.currency),
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
