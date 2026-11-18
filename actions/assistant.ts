"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { getDocument, issueDocument } from "@/lib/billing"
import {
  type AssistantResult,
  prepareAssistantEmit,
  readAssistantDocument,
  readTicketHeader,
  releaseAssistantEmit,
  saveAssistantBilling,
  saveAssistantResult,
  saveBuyerAddress,
} from "@/lib/billing-assistant"
import { lookupPadron } from "@/lib/padron"
import { assertCanAny } from "@/lib/roles"
import { brandLogoUrl } from "@/lib/cover"
import { prisma } from "@/lib/db"
import { AppError, errorMessage } from "@/lib/errors"
import { DOC_LABEL, PAYMENT_LABEL } from "@/lib/labels"
import { assertNoCode } from "@/lib/guard"
import { getSale } from "@/lib/sales"
import { requireTenant } from "@/lib/tenant"
import { buildTicketText, type TicketSale } from "@/lib/ticket-text"

function fail(error: unknown) {
  unstable_rethrow(error)
  return { ok: false as const, error: errorMessage(error) }
}

function width(value: number) {
  return value === 58 ? 58 : 80
}

async function ticketSale(saleId: string) {
  const ctx = await requireTenant()
  const sale = await getSale(ctx, saleId)
  if (sale.status === "DRAFT") throw new AppError("La venta está pendiente")
  const [business, header, logo] = await Promise.all([
    prisma.business.findFirst({ where: { id: ctx.businessId } }),
    readTicketHeader(ctx.businessId),
    brandLogoUrl(),
  ])
  const data: TicketSale = {
    businessName: header.tradeName || business?.name || ctx.businessName,
    legalName: business?.legalName,
    taxId: business?.taxId,
    address: header.address,
    code: sale.id.slice(-6).toUpperCase(),
    createdAt: sale.createdAt,
    cashier: sale.user.name,
    customer: sale.customer?.name ?? null,
    currency: ctx.currency,
    lines: sale.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, total: line.total })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    payments: sale.payments.map((payment) => ({ label: PAYMENT_LABEL[payment.method] ?? payment.method, amount: payment.amount })),
    voided: sale.status === "VOIDED",
  }
  return { ctx, data, logo }
}

export async function saleTicketAction(saleId: string, paper: number) {
  try {
    const { data, logo } = await ticketSale(saleId)
    return { ok: true as const, text: buildTicketText(data, width(paper)), brand: data.businessName, logo }
  } catch (error) {
    return fail(error)
  }
}

export async function documentTicketAction(documentId: string, paper: number) {
  try {
    const ctx = await requireTenant()
    const document = await getDocument(ctx, documentId)
    if (!document.saleId) throw new AppError("El comprobante no tiene una venta")
    const [{ data, logo }, extra, profile] = await Promise.all([
      ticketSale(document.saleId),
      readAssistantDocument(ctx, document.id),
      prisma.billingProfile.findUnique({ where: { businessId: ctx.businessId } }),
    ])
    const title = DOC_LABEL[document.docType] ?? document.docType
    const text = buildTicketText(data, width(paper), {
      title: document.docType === "FACTURA" || document.docType === "BOLETA" ? `${title} electrónica` : title,
      number: `${document.series}-${String(document.number).padStart(8, "0")}`,
      customerName: document.customerName,
      customerDoc: document.customerDoc,
      taxable: document.taxable,
      tax: document.tax,
      igvRate: profile?.igvRate ?? 1800,
      accepted: document.status === "ACCEPTED",
      hash: extra?.hash,
    })
    return { ok: true as const, text, brand: data.businessName, logo, qr: document.status === "ACCEPTED" ? extra?.qr ?? "" : "" }
  } catch (error) {
    return fail(error)
  }
}

export async function lookupPadronAction(document: string) {
  try {
    const ctx = await requireTenant()
    assertCanAny(ctx, ["billing", "sell"])
    return { ok: true as const, party: await lookupPadron(document) }
  } catch (error) {
    return fail(error)
  }
}

export async function checkoutDocumentAction(
  saleId: string,
  docType: "FACTURA" | "BOLETA",
  buyer: { document: string; name: string; address: string },
) {
  try {
    const ctx = await requireTenant()
    if (docType !== "FACTURA" && docType !== "BOLETA") throw new AppError("Tipo de comprobante inválido")
    assertNoCode(buyer.name)
    assertNoCode(buyer.address)
    const document = await issueDocument(ctx, saleId, docType, undefined, { document: buyer.document, name: buyer.name })
    await saveBuyerAddress(ctx, document.id, buyer.address)
    revalidatePath("/facturacion")
    return { ok: true as const, id: document.id }
  } catch (error) {
    return fail(error)
  }
}

export async function prepareEmitAction(documentId: string) {
  try {
    const ctx = await requireTenant()
    const sale = await prepareAssistantEmit(ctx, documentId)
    return { ok: true as const, sale }
  } catch (error) {
    return fail(error)
  }
}

export async function saveEmitResultAction(documentId: string, result: AssistantResult) {
  try {
    const ctx = await requireTenant()
    const document = await saveAssistantResult(ctx, documentId, result)
    revalidatePath(`/facturacion/${documentId}`)
    revalidatePath("/facturacion")
    return { ok: true as const, status: document.status, error: document.lastError ?? "" }
  } catch (error) {
    return fail(error)
  }
}

export async function releaseEmitAction(documentId: string, reason: string) {
  try {
    const ctx = await requireTenant()
    await releaseAssistantEmit(ctx, documentId, reason)
    revalidatePath(`/facturacion/${documentId}`)
    return { ok: true as const }
  } catch (error) {
    return fail(error)
  }
}

export async function saveAssistantBillingAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const text = (name: string) => String(formData.get(name) ?? "")
    const fields = ["tradeName", "address", "ubigeo", "department", "province", "district", "phone", "email", "solUser"]
    for (const name of fields) assertNoCode(text(name))
    const cert = formData.get("cert")
    await saveAssistantBilling(ctx, {
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
      cert: cert instanceof File ? cert : null,
    })
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
}
