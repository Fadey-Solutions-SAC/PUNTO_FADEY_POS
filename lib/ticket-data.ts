/** Datos del ticket de una venta (nota de venta o comprobante) para la pantalla y la ticketera. */
import { readAssistantDocument, readTicketHeader } from "@/lib/billing-assistant"
import { afectacionIgv, getDocument, saleTaxSplit } from "@/lib/billing"
import { brandLogoUrl } from "@/lib/cover"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { DOC_LABEL } from "@/lib/labels"
import { listPaymentMethods } from "@/lib/payment-methods"
import { getSale } from "@/lib/sales"
import { buildTicketText, type TicketSale } from "@/lib/ticket-text"
import type { TenantContext } from "@/lib/types"

export function paperWidth(value: unknown) {
  return Number(value) === 58 ? 58 : 80
}

export async function saleTicket(ctx: TenantContext, saleId: string) {
  const sale = await getSale(ctx, saleId)
  if (sale.status === "DRAFT") throw new AppError("La venta está pendiente")
  const [business, header, logo, methods, profile, products] = await Promise.all([
    prisma.business.findFirst({ where: { id: ctx.businessId } }),
    readTicketHeader(ctx.businessId),
    brandLogoUrl(ctx.businessId),
    listPaymentMethods(ctx),
    prisma.billingProfile.findUnique({ where: { businessId: ctx.businessId } }),
    prisma.product.findMany({ where: { id: { in: sale.lines.map((line) => line.productId) } }, select: { id: true, taxType: true } }),
  ])
  // Desglose: gravada (sin IGV), exonerada, inafecta e IGV, repartiendo el descuento como en la emisión.
  const taxOf = new Map(products.map((item) => [item.id, item.taxType]))
  const lineTaxes = sale.lines.map((line) => ({ total: line.total, taxType: taxOf.get(line.productId) ?? "GRAVADO" }))
  const split = saleTaxSplit(sale.total, lineTaxes, profile?.igvRate ?? 1800)
  const taxes = { gravada: 0, exonerada: 0, inafecta: 0, igv: split.tax }
  split.shares.forEach((share, index) => {
    const code = afectacionIgv(lineTaxes[index].taxType)
    if (code === "20") taxes.exonerada += share
    else if (code === "30") taxes.inafecta += share
    else taxes.gravada += share
  })
  taxes.gravada -= split.tax
  const labels = Object.fromEntries(methods.map((item) => [item.code, item.label]))
  const data: TicketSale = {
    businessName: header.tradeName || business?.name || ctx.businessName,
    legalName: business?.legalName,
    taxId: business?.taxId,
    address: header.address,
    phone: header.phone,
    email: header.email,
    taxes,
    code: sale.id.slice(-6).toUpperCase(),
    createdAt: sale.createdAt,
    cashier: sale.user.name,
    customer: sale.customer?.name ?? null,
    currency: ctx.currency,
    lines: sale.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, total: line.total })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    payments: sale.payments.map((payment) => ({ label: labels[payment.method] ?? payment.method, amount: payment.amount })),
    voided: sale.status === "VOIDED",
  }
  return { sale, data, logo }
}

export async function documentTicket(ctx: TenantContext, documentId: string, width: number) {
  const document = await getDocument(ctx, documentId)
  if (!document.saleId) throw new AppError("El comprobante no tiene una venta")
  const [{ data, logo }, extra, profile] = await Promise.all([
    saleTicket(ctx, document.saleId),
    readAssistantDocument(ctx, document.id),
    prisma.billingProfile.findUnique({ where: { businessId: ctx.businessId } }),
  ])
  const title = DOC_LABEL[document.docType] ?? document.docType
  const accepted = document.status === "ACCEPTED"
  const text = buildTicketText(data, width, {
    title: document.docType === "FACTURA" || document.docType === "BOLETA" ? `${title} electrónica` : title,
    number: `${document.series}-${String(document.number).padStart(8, "0")}`,
    customerName: document.customerName,
    customerDoc: document.customerDoc,
    taxable: document.taxable,
    tax: document.tax,
    igvRate: profile?.igvRate ?? 1800,
    accepted,
    hash: extra?.hash,
  })
  return { text, brand: data.businessName, logo, qr: accepted ? (extra?.qr ?? "") : "", accepted, saleId: document.saleId }
}
