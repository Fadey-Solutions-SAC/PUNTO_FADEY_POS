/**
 * Asistente local (Fadey Impresión, el mismo de Resto Fadey): imprime en la ticketera y firma/envía a SUNAT.
 * El navegador habla con el asistente de su PC; este servidor solo prepara los datos y guarda el resultado.
 */
import type { Express } from "express"
import {
  type AssistantResult,
  assistantBillingReady,
  prepareAssistantEmit,
  readAssistantBilling,
  readAssistantDocument,
  releaseAssistantEmit,
  saveAssistantBilling,
  saveAssistantResult,
} from "../../lib/billing-assistant"
import { getDocument } from "../../lib/billing"
import { AppError, errorMessage } from "../../lib/errors"
import { assertNoCode } from "../../lib/guard"
import { documentTicket, paperWidth } from "../../lib/ticket-data"
import { requireApiTenant, type AuthedRequest } from "../tenant"

export function registerAssistantRoutes(app: Express) {
  // Datos SUNAT del asistente (los secretos nunca vuelven al navegador).
  app.get("/api/assistant/billing", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      res.json({ ...(await readAssistantBilling(ctx)), ready: await assistantBillingReady(ctx.businessId) })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/assistant/billing", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>
      const text = (name: string) => String(body[name] ?? "")
      for (const name of ["tradeName", "address", "ubigeo", "department", "province", "district", "phone", "email", "solUser"]) assertNoCode(text(name))
      let cert: { name: string; bytes: Buffer } | null = null
      if (body.certBase64) {
        const bytes = Buffer.from(String(body.certBase64), "base64")
        if (!bytes.length) throw new AppError("No se pudo leer el certificado")
        cert = { name: text("certName") || "certificado.pfx", bytes }
      }
      await saveAssistantBilling(req.tenant!, {
        tradeName: text("tradeName"),
        address: text("address"),
        ubigeo: text("ubigeo"),
        department: text("department"),
        province: text("province"),
        district: text("district"),
        phone: text("phone"),
        email: text("email"),
        solUser: text("solUser"),
        solPassword: text("solPassword"),
        certPassword: text("certPassword"),
        cert,
      })
      res.json({ ok: true, ready: await assistantBillingReady(req.tenant!.businessId) })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Texto del comprobante para la ticketera (con hash y QR cuando SUNAT lo aceptó).
  app.get("/api/billing/:id/ticket", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      res.json(await documentTicket(req.tenant!, String(req.params.id), paperWidth(req.query.width)))
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Paso 1: datos firmables para el asistente (marca el comprobante como enviado).
  app.post("/api/billing/:id/assistant/prepare", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      res.json({ ok: true, sale: await prepareAssistantEmit(req.tenant!, String(req.params.id)) })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Paso 2: respuesta del asistente (solo queda ACEPTADO si el CDR de SUNAT coincide).
  app.post("/api/billing/:id/assistant/result", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const document = await saveAssistantResult(req.tenant!, String(req.params.id), (req.body ?? {}) as AssistantResult)
      res.json({ ok: true, status: document.status, error: document.lastError ?? "" })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Si el asistente no se pudo usar, el comprobante vuelve a quedar para reintentar.
  app.post("/api/billing/:id/assistant/release", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await releaseAssistantEmit(req.tenant!, String(req.params.id), String(req.body?.reason ?? ""))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/billing/:id/pdf", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const document = await getDocument(ctx, String(req.params.id))
      const extra = await readAssistantDocument(ctx, document.id)
      if (!extra?.pdfBase64) {
        res.status(404).json({ error: "Este comprobante no tiene PDF" })
        return
      }
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Disposition", `attachment; filename="${document.series}-${document.number}.pdf"`)
      res.send(Buffer.from(extra.pdfBase64, "base64"))
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
