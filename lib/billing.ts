import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { D } from "@/lib/money"
import { assertCan, assertCanAny } from "@/lib/roles"
import { decryptSecret, encryptSecret } from "@/lib/secret"
import type { TenantContext } from "@/lib/types"

export const DOC_TYPES = ["FACTURA", "BOLETA", "NOTA_CREDITO", "NOTA_DEBITO"] as const
export type DocType = (typeof DOC_TYPES)[number]

const SUNAT_CODE: Record<DocType, string> = {
  FACTURA: "01",
  BOLETA: "03",
  NOTA_CREDITO: "07",
  NOTA_DEBITO: "08",
}

const DEFAULT_SERIES: Record<DocType, string> = {
  FACTURA: "F001",
  BOLETA: "B001",
  NOTA_CREDITO: "FC01",
  NOTA_DEBITO: "FD01",
}

const ROOT: Record<DocType, string> = {
  FACTURA: "Invoice",
  BOLETA: "Invoice",
  NOTA_CREDITO: "CreditNote",
  NOTA_DEBITO: "DebitNote",
}

const MAX_ATTEMPTS = 5

export function isDocType(value: string): value is DocType {
  return (DOC_TYPES as readonly string[]).includes(value)
}

export function validRuc(value: string) {
  if (!/^(10|15|16|17|20)\d{9}$/.test(value)) return false
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = factors.reduce((total, factor, index) => total + factor * Number(value[index]), 0)
  const remainder = 11 - (sum % 11)
  const check = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder
  return check === Number(value[10])
}

export function validDni(value: string) {
  return /^\d{8}$/.test(value)
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function money(cents: number) {
  return D(cents).div(100).toFixed(2)
}

function splitTax(total: number, igvRate: number) {
  const taxable = D(total).mul(10000).div(D(10000).plus(igvRate)).toDecimalPlaces(0).toNumber()
  return { taxable, tax: total - taxable }
}

/** Código SUNAT de afectación del IGV según el tipo de impuesto del producto. */
export const TAX_TYPES = { GRAVADO: "Gravado (IGV)", EXONERADO: "Exonerado", INAFECTO: "Inafecto" } as const
export type TaxType = keyof typeof TAX_TYPES
export function afectacionIgv(taxType: string | null | undefined) {
  return taxType === "EXONERADO" ? "20" : taxType === "INAFECTO" ? "30" : "10"
}

/**
 * Reparte el total cobrado (ya con descuento) entre las líneas y separa el IGV:
 * solo las líneas gravadas llevan IGV; exoneradas e inafectas no.
 */
export function saleTaxSplit(
  saleTotal: number,
  lines: { total: number; taxType?: string | null }[],
  igvRate: number,
) {
  const gross = lines.reduce((sum, line) => sum + line.total, 0)
  let assigned = 0
  let gravado = 0
  const shares = lines.map((line, index) => {
    const share =
      index === lines.length - 1 ? saleTotal - assigned : gross > 0 ? D(line.total).mul(saleTotal).div(gross).toDecimalPlaces(0).toNumber() : 0
    assigned += share
    if (afectacionIgv(line.taxType) === "10") gravado += share
    return share
  })
  const tax = gravado - splitTax(gravado, igvRate).taxable
  return { shares, tax, taxable: saleTotal - tax }
}

function buildXml(input: {
  docType: DocType
  series: string
  number: number
  issuedAt: Date
  supplierRuc: string
  supplierName: string
  customerName: string
  customerDocType: string
  customerDoc: string
  taxable: number
  tax: number
  total: number
  lines: { description: string; quantity: number; total: number }[]
  related?: { series: string; number: number; code: string }
}) {
  const id = `${input.series}-${input.number}`
  const date = input.issuedAt.toISOString().slice(0, 10)
  const root = ROOT[input.docType]
  const lineTag = input.docType === "NOTA_CREDITO" ? "CreditNoteLine" : input.docType === "NOTA_DEBITO" ? "DebitNoteLine" : "InvoiceLine"
  const qtyTag = input.docType === "NOTA_DEBITO" ? "DebitedQuantity" : input.docType === "NOTA_CREDITO" ? "CreditedQuantity" : "InvoicedQuantity"
  const typeTag = input.docType === "NOTA_CREDITO" ? "CreditNoteTypeCode" : input.docType === "NOTA_DEBITO" ? "DebitNoteTypeCode" : "InvoiceTypeCode"
  const lines = input.lines
    .map((line, index) => {
      const qty = D(line.quantity).div(10000).toFixed(4)
      const amount = money(line.total)
      return `<cac:${lineTag}><cbc:ID>${index + 1}</cbc:ID><cbc:${qtyTag} unitCode="NIU">${qty}</cbc:${qtyTag}><cbc:LineExtensionAmount currencyID="PEN">${amount}</cbc:LineExtensionAmount><cac:Item><cbc:Description>${xmlEscape(line.description)}</cbc:Description></cac:Item><cac:Price><cbc:PriceAmount currencyID="PEN">${amount}</cbc:PriceAmount></cac:Price></cac:${lineTag}>`
    })
    .join("")
  const reference = input.related
    ? `<cac:DiscrepancyResponse><cbc:ReferenceID>${input.related.series}-${input.related.number}</cbc:ReferenceID><cbc:ResponseCode>01</cbc:ResponseCode><cbc:Description>Ajuste de la operacion</cbc:Description></cac:DiscrepancyResponse><cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${input.related.series}-${input.related.number}</cbc:ID><cbc:DocumentTypeCode>${input.related.code}</cbc:DocumentTypeCode></cac:InvoiceDocumentReference></cac:BillingReference>`
    : ""
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:UBLVersionID>2.1</cbc:UBLVersionID>
<cbc:CustomizationID>2.0</cbc:CustomizationID>
<cbc:ID>${id}</cbc:ID>
<cbc:IssueDate>${date}</cbc:IssueDate>
<cbc:${typeTag}>${SUNAT_CODE[input.docType]}</cbc:${typeTag}>
<cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
${reference}
<cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="6">${xmlEscape(input.supplierRuc)}</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName>${xmlEscape(input.supplierName)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="${xmlEscape(input.customerDocType)}">${xmlEscape(input.customerDoc)}</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName>${xmlEscape(input.customerName)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
<cac:TaxTotal><cbc:TaxAmount currencyID="PEN">${money(input.tax)}</cbc:TaxAmount></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="PEN">${money(input.taxable)}</cbc:LineExtensionAmount><cbc:TaxInclusiveAmount currencyID="PEN">${money(input.total)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="PEN">${money(input.total)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
${lines}
</${root}>`
}

export async function saveBillingProfile(
  ctx: TenantContext,
  input: { endpoint?: string; token?: string; environment?: string; igvRate?: string },
) {
  assertCan(ctx, "billing")
  const rate = input.igvRate ? Math.round(Number(input.igvRate) * 100) : undefined
  if (rate !== undefined && (rate < 0 || rate > 10000)) throw new AppError("IGV inválido")
  const data = {
    endpoint: input.endpoint?.trim() || null,
    environment: input.environment === "prod" ? "prod" : "beta",
    ...(rate !== undefined ? { igvRate: rate } : {}),
    ...(input.token?.trim() ? { tokenCipher: encryptSecret(input.token.trim()) } : {}),
  }
  await prisma.billingProfile.upsert({
    where: { businessId: ctx.businessId },
    create: { businessId: ctx.businessId, ...data },
    update: data,
  })
  await prisma.auditLog.create({
    data: { businessId: ctx.businessId, userId: ctx.userId, action: "BILLING_CONFIG", entity: "BillingProfile", detail: "Credenciales actualizadas" },
  })
}

export async function saveSeries(ctx: TenantContext, docType: DocType, series: string) {
  assertCan(ctx, "billing")
  const clean = series.trim().toUpperCase()
  if (!/^[A-Z0-9]{4}$/.test(clean)) throw new AppError("La serie debe tener 4 caracteres")
  const current = await prisma.documentSeries.findUnique({
    where: { businessId_docType: { businessId: ctx.businessId, docType } },
  })
  if (current && current.nextNumber > 1) throw new AppError("La serie ya tiene comprobantes emitidos")
  await prisma.documentSeries.upsert({
    where: { businessId_docType: { businessId: ctx.businessId, docType } },
    create: { businessId: ctx.businessId, docType, series: clean, nextNumber: 1 },
    update: { series: clean },
  })
}

export async function issueDocument(
  ctx: TenantContext,
  saleId: string,
  docType: DocType,
  relatedId?: string,
  buyer?: { document: string; name: string },
) {
  if (docType === "FACTURA" || docType === "BOLETA") assertCanAny(ctx, ["billing", "sell"])
  else assertCan(ctx, "billing")
  const business = await prisma.business.findFirst({ where: { id: ctx.businessId } })
  if (!business?.taxId || !validRuc(business.taxId)) {
    throw new AppError("Configura un RUC válido del negocio antes de emitir")
  }
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, businessId: ctx.businessId },
      include: { customer: true, lines: { include: { product: { select: { taxType: true } } } } },
    })
    if (!sale || sale.status !== "COMPLETED") throw new AppError("La venta no está confirmada")
    if (docType === "FACTURA" || docType === "BOLETA") {
      const prior = await tx.electronicDocument.findFirst({
        where: { businessId: ctx.businessId, saleId: sale.id, docType, status: { notIn: ["REJECTED"] } },
      })
      if (prior) return prior
    }
    const useBuyer = Boolean(buyer) && (docType === "FACTURA" || docType === "BOLETA")
    let customerName = (useBuyer ? buyer!.name.trim().slice(0, 200) : sale.customer?.name) || "CLIENTES VARIOS"
    let customerDoc = (useBuyer ? buyer!.document.replace(/\D/g, "") : sale.customer?.document?.trim()) ?? ""
    if (docType === "FACTURA" && useBuyer && buyer!.name.trim().length < 2) throw new AppError("La factura exige la razón social del cliente")
    let customerDocType = "0"
    if (docType === "FACTURA") {
      if (!customerDoc || !validRuc(customerDoc)) throw new AppError("La factura exige un cliente con RUC válido")
      customerDocType = "6"
    } else if (customerDoc) {
      if (validRuc(customerDoc)) customerDocType = "6"
      else if (validDni(customerDoc)) customerDocType = "1"
      else throw new AppError("El documento del cliente debe ser DNI de 8 dígitos o RUC válido")
    } else if (docType !== "BOLETA") {
      throw new AppError("La nota exige el cliente del comprobante original")
    }
    let related: { series: string; number: number; code: string } | undefined
    if (docType === "NOTA_CREDITO" || docType === "NOTA_DEBITO") {
      const source = await tx.electronicDocument.findFirst({
        where: { id: relatedId, businessId: ctx.businessId, saleId: sale.id },
      })
      if (!source || source.status !== "ACCEPTED") {
        throw new AppError("La nota solo puede referir un comprobante aceptado por SUNAT")
      }
      related = { series: source.series, number: source.number, code: SUNAT_CODE[source.docType as DocType] }
      customerName = source.customerName
      customerDoc = source.customerDoc ?? ""
      customerDocType = source.customerDocType ?? "0"
    }
    const profile = await tx.billingProfile.findUnique({ where: { businessId: ctx.businessId } })
    const igvRate = profile?.igvRate ?? 1800
    const amounts = saleTaxSplit(
      sale.total,
      sale.lines.map((line) => ({ total: line.total, taxType: line.product?.taxType })),
      igvRate,
    )
    let seriesRow = await tx.documentSeries.findUnique({
      where: { businessId_docType: { businessId: ctx.businessId, docType } },
    })
    if (!seriesRow) {
      seriesRow = await tx.documentSeries.create({
        data: { businessId: ctx.businessId, docType, series: DEFAULT_SERIES[docType], nextNumber: 1 },
      })
    }
    const number = seriesRow.nextNumber
    await tx.documentSeries.update({ where: { id: seriesRow.id }, data: { nextNumber: number + 1 } })
    const issuedAt = new Date()
    const xmlText = buildXml({
      docType,
      series: seriesRow.series,
      number,
      issuedAt,
      supplierRuc: business.taxId!,
      supplierName: business.legalName || business.name,
      customerName,
      customerDocType,
      customerDoc: customerDoc || "-",
      taxable: amounts.taxable,
      tax: amounts.tax,
      total: sale.total,
      lines: sale.lines.map((line) => ({ description: line.description, quantity: line.quantity, total: line.total })),
      related,
    })
    const created = await tx.electronicDocument.create({
      data: {
        businessId: ctx.businessId,
        saleId: sale.id,
        relatedId: relatedId || null,
        docType,
        series: seriesRow.series,
        number,
        status: "QUEUED",
        customerName,
        customerDocType,
        customerDoc: customerDoc || null,
        taxable: amounts.taxable,
        tax: amounts.tax,
        total: sale.total,
        xmlText,
        issuedAt,
      },
    })
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: "DOCUMENT_ISSUE",
        entity: "ElectronicDocument",
        entityId: created.id,
        detail: `${created.series}-${created.number} en cola`,
      },
    })
    return created
  })
}

function interpretSunat(body: string) {
  const application = body.includes("ApplicationResponse")
  const codeMatch = body.match(/<cbc:ResponseCode>\s*([^<]+)\s*<\/cbc:ResponseCode>/)
  const code = codeMatch?.[1]?.trim()
  if (application && code === "0") return { status: "ACCEPTED" as const, code, cdr: body }
  if (application && code) return { status: "REJECTED" as const, code, cdr: body }
  try {
    const json = JSON.parse(body) as { sunat_responsecode?: string; cdr_zip_base64?: string; enlace_del_cdr?: string }
    if (json.sunat_responsecode === "0" && (json.cdr_zip_base64 || json.enlace_del_cdr)) {
      return { status: "ACCEPTED" as const, code: "0", cdr: json.cdr_zip_base64 || json.enlace_del_cdr || "" }
    }
    if (json.sunat_responsecode) return { status: "REJECTED" as const, code: json.sunat_responsecode, cdr: body }
  } catch {
    return null
  }
  return null
}

export async function sendDocument(ctx: TenantContext, documentId: string) {
  assertCan(ctx, "billing")
  const document = await prisma.electronicDocument.findFirst({
    where: { id: documentId, businessId: ctx.businessId },
  })
  if (!document) throw new AppError("Comprobante no encontrado")
  if (document.status === "ACCEPTED") return document
  if (document.attempts >= MAX_ATTEMPTS) throw new AppError("Se agotaron los reintentos. Revisa el error antes de seguir")
  const profile = await prisma.billingProfile.findUnique({ where: { businessId: ctx.businessId } })
  if (!profile?.endpoint || !profile.tokenCipher) {
    await prisma.electronicDocument.updateMany({
      where: { id: document.id, businessId: ctx.businessId, status: { not: "ACCEPTED" } },
      data: { status: "QUEUED", lastError: "Proveedor no configurado. El comprobante no fue enviado ni aceptado." },
    })
    throw new AppError("Configura el proveedor de facturación. El comprobante sigue en cola y no está aceptado")
  }
  const nextAttempts = document.attempts + 1
  await prisma.electronicDocument.updateMany({
    where: { id: document.id, businessId: ctx.businessId, status: { not: "ACCEPTED" } },
    data: { status: "SENT", attempts: nextAttempts, sentAt: new Date(), lastError: null },
  })
  try {
    const response = await fetch(profile.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${decryptSecret(profile.tokenCipher)}`,
        "Content-Type": "application/xml",
        Accept: "application/xml, application/json",
      },
      body: document.xmlText,
      signal: AbortSignal.timeout(20000),
    })
    const body = await response.text()
    const interpreted = interpretSunat(body)
    if (!response.ok || !interpreted) {
      await prisma.electronicDocument.updateMany({
        where: { id: document.id, businessId: ctx.businessId, status: { not: "ACCEPTED" } },
        data: { status: "ERROR", lastError: `Respuesta no concluyente (${response.status}). No se marcó como aceptado.` },
      })
      throw new AppError("El proveedor no devolvió un CDR válido. El comprobante no quedó aceptado")
    }
    await prisma.electronicDocument.updateMany({
      where: { id: document.id, businessId: ctx.businessId },
      data: {
        status: interpreted.status,
        responseCode: interpreted.code,
        cdrText: interpreted.cdr.slice(0, 500000),
        lastError: interpreted.status === "ACCEPTED" ? null : `SUNAT respondió ${interpreted.code}`,
      },
    })
    return prisma.electronicDocument.findFirstOrThrow({ where: { id: document.id, businessId: ctx.businessId } })
  } catch (error) {
    if (error instanceof AppError) throw error
    await prisma.electronicDocument.updateMany({
      where: { id: document.id, businessId: ctx.businessId, status: { not: "ACCEPTED" } },
      data: { status: "ERROR", lastError: "No hubo respuesta del proveedor. Se puede reintentar." },
    })
    throw new AppError("No se pudo contactar al proveedor. El comprobante no quedó aceptado")
  }
}

export async function listDocuments(ctx: TenantContext) {
  assertCan(ctx, "billing")
  return prisma.electronicDocument.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { issuedAt: "desc" },
    take: 200,
  })
}

export async function getDocument(ctx: TenantContext, id: string) {
  assertCan(ctx, "billing")
  const document = await prisma.electronicDocument.findFirst({ where: { id, businessId: ctx.businessId } })
  if (!document) throw new AppError("Comprobante no encontrado")
  return document
}
