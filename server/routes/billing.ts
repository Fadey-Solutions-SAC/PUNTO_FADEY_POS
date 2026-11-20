import type { Express } from "express"
import { getDocument, isDocType, issueDocument, listDocuments, saveBillingProfile, saveSeries, sendDocument, validRuc } from "../../lib/billing"
import { AppError, errorMessage } from "../../lib/errors"
import { assertNoCode } from "../../lib/guard"
import { assistantBillingReady, assistantDocumentsWithPdf, saveBuyerAddress } from "../../lib/billing-assistant"
import { DOC_LABEL } from "../../lib/labels"
import { formatDate, formatMoney, fromPercentInt } from "../../lib/money"
import { prisma } from "../../lib/db"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

const DOC_TYPES = ["BOLETA", "FACTURA", "NOTA_CREDITO", "NOTA_DEBITO"] as const

export function registerBillingRoutes(app: Express) {
  app.get("/api/billing", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "billing", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de facturación" })
        return
      }
      const [documents, sales] = await Promise.all([
        listDocuments(ctx),
        prisma.sale.findMany({
          where: { businessId: ctx.businessId, status: "COMPLETED" },
          include: { customer: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ])
      const withPdf = await assistantDocumentsWithPdf(ctx.businessId, documents.map((document) => document.id))
      res.json({
        currency: ctx.currency,
        sales: sales.map((sale) => ({
          id: sale.id,
          label: `${formatDate(sale.createdAt)} · ${sale.customer?.name ?? "Público"} · ${formatMoney(sale.total, ctx.currency)}`,
        })),
        accepted: documents
          .filter((document) => document.status === "ACCEPTED")
          .map((document) => ({
            id: document.id,
            label: `${document.series}-${document.number}`,
          })),
        documents: documents.map((document) => ({
          id: document.id,
          issuedAtLabel: formatDate(document.issuedAt),
          label: `${DOC_LABEL[document.docType] ?? document.docType} ${document.series}-${document.number}`,
          customerName: document.customerName,
          status: document.status,
          statusLabel: DOC_LABEL[document.status] ?? document.status,
          total: formatMoney(document.total, ctx.currency),
          saleId: document.saleId,
          attempts: document.attempts,
          lastError: document.lastError ?? "",
          hasCdr: Boolean(document.cdrText),
          hasPdf: withPdf.has(document.id),
          docType: document.docType,
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/billing/issue", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const docType = String(req.body?.docType ?? "BOLETA")
      if (!DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) {
        res.status(400).json({ error: "Tipo de comprobante inválido" })
        return
      }
      const document = await issueDocument(
        ctx,
        String(req.body?.saleId ?? ""),
        docType as (typeof DOC_TYPES)[number],
        req.body?.relatedId ? String(req.body.relatedId) : undefined,
        req.body?.buyerDocument || req.body?.buyerName
          ? { document: String(req.body?.buyerDocument ?? ""), name: String(req.body?.buyerName ?? "") }
          : undefined,
      )
      if (req.body?.buyerAddress) {
        assertNoCode(String(req.body.buyerAddress))
        await saveBuyerAddress(ctx, document.id, String(req.body.buyerAddress))
      }
      res.json({ ok: true, id: document.id, status: document.status })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
  // Configuración del proveedor (el token nunca se devuelve) y series.
  app.get("/api/billing/config", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "billing", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de facturación" })
        return
      }
      const [profile, series, business] = await Promise.all([
        prisma.billingProfile.findUnique({ where: { businessId: ctx.businessId } }),
        prisma.documentSeries.findMany({ where: { businessId: ctx.businessId } }),
        prisma.business.findUnique({ where: { id: ctx.businessId }, select: { taxId: true, legalName: true, name: true } }),
      ])
      const defaults: Record<string, string> = { BOLETA: "B001", FACTURA: "F001", NOTA_CREDITO: "BC01", NOTA_DEBITO: "BD01" }
      res.json({
        businessName: business?.legalName || business?.name || "",
        taxId: business?.taxId ?? "",
        taxIdValid: Boolean(business?.taxId && validRuc(business.taxId)),
        endpoint: profile?.endpoint ?? "",
        environment: profile?.environment ?? "beta",
        igvRate: fromPercentInt(profile?.igvRate ?? 1800).toFixed(2),
        hasToken: Boolean(profile?.tokenCipher),
        assistantReady: await assistantBillingReady(ctx.businessId),
        configured: Boolean(profile?.endpoint && profile?.tokenCipher),
        series: DOC_TYPES.map((docType) => {
          const row = series.find((item) => item.docType === docType)
          return {
            docType,
            label: DOC_LABEL[docType] ?? docType,
            series: row?.series ?? defaults[docType],
            nextNumber: row?.nextNumber ?? 1,
            locked: Boolean(row && row.nextNumber > 1),
          }
        }),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/billing/config", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await saveBillingProfile(req.tenant!, {
        endpoint: req.body?.endpoint != null ? String(req.body.endpoint) : undefined,
        token: req.body?.token ? String(req.body.token) : undefined,
        environment: String(req.body?.environment ?? "beta"),
        igvRate: req.body?.igvRate != null ? String(req.body.igvRate) : undefined,
      })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/billing/series", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const docType = String(req.body?.docType ?? "")
      if (!isDocType(docType)) throw new AppError("Tipo de comprobante inválido")
      await saveSeries(req.tenant!, docType, String(req.body?.series ?? ""))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/billing/:id", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const document = await getDocument(ctx, String(req.params.id))
      res.json({
        id: document.id,
        docType: document.docType,
        label: `${DOC_LABEL[document.docType] ?? document.docType} ${document.series}-${String(document.number).padStart(8, "0")}`,
        issuedAtLabel: formatDate(document.issuedAt),
        sentAtLabel: document.sentAt ? formatDate(document.sentAt) : "",
        status: document.status,
        statusLabel: DOC_LABEL[document.status] ?? document.status,
        customerName: document.customerName,
        customerDoc: document.customerDoc ?? "",
        taxable: formatMoney(document.taxable, ctx.currency),
        tax: formatMoney(document.tax, ctx.currency),
        total: formatMoney(document.total, ctx.currency),
        attempts: document.attempts,
        lastError: document.lastError ?? "",
        responseCode: document.responseCode ?? "",
        hasCdr: Boolean(document.cdrText),
        saleId: document.saleId,
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/billing/:id/send", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const document = await sendDocument(req.tenant!, String(req.params.id))
      res.json({ ok: true, status: document.status, statusLabel: DOC_LABEL[document.status] ?? document.status })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/billing/:id/xml", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const document = await getDocument(req.tenant!, String(req.params.id))
      res.setHeader("Content-Type", "application/xml; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="${document.series}-${document.number}.xml"`)
      res.send(document.xmlText)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/billing/:id/cdr", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const document = await getDocument(req.tenant!, String(req.params.id))
      if (!document.cdrText) {
        res.status(404).json({ error: "Este comprobante no tiene CDR: SUNAT todavía no lo aceptó" })
        return
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="${document.series}-${document.number}-cdr.txt"`)
      res.send(document.cdrText)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
