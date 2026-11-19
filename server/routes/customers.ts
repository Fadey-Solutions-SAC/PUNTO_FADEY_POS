import type { Express } from "express"
import { listCustomers, saveCustomer } from "../../lib/customers"
import { errorMessage } from "../../lib/errors"
import { formatMoney } from "../../lib/money"
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
}
