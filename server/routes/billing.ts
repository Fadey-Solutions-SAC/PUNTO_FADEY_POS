import type { Express } from "express"
import { issueDocument, listDocuments } from "../../lib/billing"
import { errorMessage } from "../../lib/errors"
import { DOC_LABEL } from "../../lib/labels"
import { formatDate, formatMoney } from "../../lib/money"
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
      )
      res.json({ ok: true, id: document.id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
