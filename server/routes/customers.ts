import type { Express } from "express"
import { listCustomers, registerAbono, saveCustomer } from "../../lib/customers"
import { errorMessage } from "../../lib/errors"
import { formatDate, limaDay, formatMoney } from "../../lib/money"
import { listPaymentMethods } from "../../lib/payment-methods"
import { prisma } from "../../lib/db"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

export function registerCustomersRoutes(app: Express) {
  app.get("/api/customers", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "customers", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de clientes" })
        return
      }
      const customers = await listCustomers(ctx)
      res.json({
        currency: ctx.currency,
        customers: customers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          document: customer.document ?? "",
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          address: customer.address ?? "",
          debt: formatMoney(customer.balance, ctx.currency),
          limit: formatMoney(customer.creditLimit, ctx.currency),
          creditLimitAmount: (customer.creditLimit / 100).toFixed(2),
          isActive: customer.isActive,
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/customers", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const id = await saveCustomer(ctx, {
        id: req.body?.id ? String(req.body.id) : undefined,
        name: String(req.body?.name ?? ""),
        document: req.body?.document != null ? String(req.body.document) : undefined,
        phone: req.body?.phone != null ? String(req.body.phone) : undefined,
        email: req.body?.email != null ? String(req.body.email) : undefined,
        address: req.body?.address != null ? String(req.body.address) : undefined,
        creditLimit: req.body?.creditLimit != null ? String(req.body.creditLimit) : "0",
        isActive: req.body?.isActive !== false,
      })
      res.json({ ok: true, id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/customers/history", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "customers", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de clientes" })
        return
      }
      const customerId = String(req.query.cliente ?? "")
      const [customers, sales] = await Promise.all([
        prisma.customer.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
        prisma.sale.findMany({
          where: {
            businessId: ctx.businessId,
            status: "COMPLETED",
            customerId: customerId || { not: null },
          },
          include: { customer: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ])
      res.json({
        currency: ctx.currency,
        customers: customers.map((customer) => ({ id: customer.id, name: customer.name })),
        sales: sales.map((sale) => ({
          id: sale.id,
          createdAtLabel: formatDate(sale.createdAt),
          day: limaDay(sale.createdAt),
          customerName: sale.customer?.name ?? "—",
          typeLabel: sale.saleType === "CREDIT" ? "Crédito" : "Contado",
          total: formatMoney(sale.total, ctx.currency),
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/customers/credits", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "customers", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de clientes" })
        return
      }
      const [sales, methods] = await Promise.all([
        prisma.sale.findMany({
          where: { businessId: ctx.businessId, saleType: "CREDIT", status: "COMPLETED" },
          include: { customer: true, abonos: true, returns: true },
          orderBy: { createdAt: "desc" },
        }),
        listPaymentMethods(ctx),
      ])
      const open = sales
        .map((sale) => {
          const paid = sale.abonos.reduce((sum, item) => sum + item.amount, 0)
          const returned = sale.returns.reduce((sum, item) => sum + item.total, 0)
          return {
            saleId: sale.id,
            customerId: sale.customerId,
            customerName: sale.customer?.name ?? "—",
            createdAtLabel: formatDate(sale.createdAt),
            dueCents: sale.total - paid - returned,
            due: formatMoney(sale.total - paid - returned, ctx.currency),
          }
        })
        .filter((item) => item.dueCents > 0 && item.customerId)
      res.json({
        currency: ctx.currency,
        methods: methods.map((method) => ({ code: method.code, label: method.label })),
        accounts: open,
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/customers/credits/abono", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      await registerAbono(
        ctx,
        String(req.body?.customerId ?? ""),
        String(req.body?.amount ?? "0"),
        req.body?.saleId ? String(req.body.saleId) : undefined,
        String(req.body?.method ?? "CASH"),
      )
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
