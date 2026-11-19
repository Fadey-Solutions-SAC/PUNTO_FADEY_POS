import type { Express } from "express"
import { errorMessage } from "../../lib/errors"
import { fromPercentInt } from "../../lib/money"
import {
  createPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
} from "../../lib/payment-methods"
import { readPosSettings, saveHardwareReader } from "../../lib/pos-settings"
import { can } from "../../lib/roles"
import { businessSnapshot, createBranch, updateBusiness } from "../../lib/settings"
import { APP_VERSION, formatAppVersion } from "../../lib/version"
import { requireApiTenant, type AuthedRequest } from "../tenant"

export function registerSettingsRoutes(app: Express) {
  app.get("/api/settings", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "settings", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de configuración" })
        return
      }
      const [{ business, branches, users }, methods, pos] = await Promise.all([
        businessSnapshot(ctx),
        listPaymentMethods(ctx),
        readPosSettings(ctx.businessId),
      ])
      res.json({
        version: APP_VERSION,
        versionLabel: formatAppVersion(),
        business: {
          name: business.name,
          legalName: business.legalName ?? "",
          taxId: business.taxId ?? "",
          currency: business.currency,
          discountLimitPct: fromPercentInt(business.discountLimitPct).toFixed(2),
          allowCredit: business.allowCredit,
        },
        branches: branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          warehouses: branch.warehouses.length,
          registers: branch.registers.filter((register) => register.isActive).length,
        })),
        users: users.map((membership) => ({
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          role: membership.role,
        })),
        paymentMethods: methods,
        hardwareReader: pos.hardwareReader,
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/settings/business", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      await updateBusiness(ctx, {
        name: String(req.body?.name ?? ""),
        legalName: req.body?.legalName != null ? String(req.body.legalName) : undefined,
        taxId: req.body?.taxId != null ? String(req.body.taxId) : undefined,
        currency: String(req.body?.currency ?? "PEN"),
        discountLimitPct: String(req.body?.discountLimitPct ?? "0"),
        allowCredit: Boolean(req.body?.allowCredit),
      })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/settings/branches", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const branch = await createBranch(req.tenant!, {
        name: String(req.body?.name ?? ""),
        address: req.body?.address != null ? String(req.body.address) : undefined,
      })
      res.json({ ok: true, id: branch.id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/settings/payment-methods", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await createPaymentMethod(req.tenant!, String(req.body?.label ?? ""))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete("/api/settings/payment-methods/:id", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await deletePaymentMethod(req.tenant!, String(req.params.id))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/settings/hardware-reader", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await saveHardwareReader(req.tenant!, Boolean(req.body?.enabled))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
