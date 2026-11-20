import type { Express } from "express"
import { errorMessage } from "../../lib/errors"
import { lookupPadron } from "../../lib/padron"
import { assertCanAny } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

/** Consulta DNI (RENIEC) o RUC (SUNAT) en Decolecta para completar clientes y proveedores. */
export function registerLookupRoutes(app: Express) {
  app.get("/api/lookup/document", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      assertCanAny(ctx, ["sell", "customers", "purchases", "billing"])
      const party = await lookupPadron(String(req.query.numero ?? ""))
      res.json(party)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
