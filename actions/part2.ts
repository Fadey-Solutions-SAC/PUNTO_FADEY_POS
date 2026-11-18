"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { unstable_rethrow } from "next/navigation"
import { isDocType, issueDocument, saveBillingProfile, saveSeries, sendDocument } from "@/lib/billing"
import { errorMessage } from "@/lib/errors"
import { createPurchase, payPurchase, receivePurchase, saveSupplier } from "@/lib/purchases"
import { closeOpenRequirement, saveRequirement } from "@/lib/requirements"
import { PERMISSIONS, ROLES, can } from "@/lib/roles"
import { prisma } from "@/lib/db"
import { assertCan } from "@/lib/roles"
import { requireTenant } from "@/lib/tenant"

function formError(error: unknown) {
  unstable_rethrow(error)
  return { error: errorMessage(error) }
}

export async function saveSupplierAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await saveSupplier(ctx, {
      id: String(formData.get("id") ?? "") || undefined,
      tradeName: String(formData.get("tradeName") ?? ""),
      legalName: String(formData.get("legalName") ?? ""),
      taxId: String(formData.get("taxId") ?? ""),
      address: String(formData.get("address") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      contact: String(formData.get("contact") ?? ""),
      isActive: formData.get("isActive") === "on",
    })
    revalidatePath("/compras/proveedores")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function saveRequirementAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const lines = JSON.parse(String(formData.get("lines") ?? "[]")) as { productId: string; quantity: string }[]
    await saveRequirement(ctx, lines)
    revalidatePath("/compras/requerimiento")
    revalidatePath("/compras/recepcion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function createPurchaseAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const lines = JSON.parse(String(formData.get("lines") ?? "[]")) as {
      productId: string
      presentationId?: string
      quantity: string
      unitCost: string
    }[]
    const method = String(formData.get("payMethod") ?? "CASH")
    const purchase = await createPurchase(ctx, {
      supplierId: String(formData.get("supplierId") ?? ""),
      documentNumber: String(formData.get("documentNumber") ?? ""),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      discount: String(formData.get("discount") ?? "0"),
      tax: String(formData.get("tax") ?? "0"),
      notes: String(formData.get("notes") ?? ""),
      receiveNow: formData.get("receiveNow") === "on",
      payNow: String(formData.get("payNow") ?? "0"),
      payMethod: method === "TRANSFER" || method === "OTHER" ? method : "CASH",
      lines,
    })
    if (formData.get("fromRequirement") === "1") await closeOpenRequirement(ctx)
    revalidatePath("/compras")
    revalidatePath("/compras/historial")
    revalidatePath("/compras/recepcion")
    revalidatePath("/compras/requerimiento")
    revalidatePath("/inventario/almacenes")
    redirect(`/compras/${purchase.id}`)
  } catch (error) {
    return formError(error)
  }
}

export async function receivePurchaseAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const id = String(formData.get("purchaseId") ?? "")
    await receivePurchase(ctx, id)
    revalidatePath(`/compras/${id}`)
    revalidatePath("/inventario")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function payPurchaseAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const id = String(formData.get("purchaseId") ?? "")
    const rawMethod = String(formData.get("method") ?? "CASH")
    const method = rawMethod === "CARD" || rawMethod === "TRANSFER" || rawMethod === "OTHER" ? rawMethod : "CASH"
    await payPurchase(ctx, id, String(formData.get("amount") ?? ""), method)
    revalidatePath(`/compras/${id}`)
    revalidatePath("/caja")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function issueDocumentAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const docType = String(formData.get("docType") ?? "")
    if (!isDocType(docType)) return { error: "Tipo de comprobante inválido" }
    const document = await issueDocument(
      ctx,
      String(formData.get("saleId") ?? ""),
      docType,
      String(formData.get("relatedId") ?? "") || undefined,
    )
    revalidatePath("/facturacion")
    redirect(`/facturacion/${document.id}`)
  } catch (error) {
    return formError(error)
  }
}

export async function sendDocumentAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const id = String(formData.get("documentId") ?? "")
    await sendDocument(ctx, id)
    revalidatePath(`/facturacion/${id}`)
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function saveBillingAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await saveBillingProfile(ctx, {
      endpoint: String(formData.get("endpoint") ?? ""),
      token: String(formData.get("token") ?? ""),
      environment: String(formData.get("environment") ?? "beta"),
      igvRate: String(formData.get("igvRate") ?? ""),
    })
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function saveSeriesAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const docType = String(formData.get("docType") ?? "")
    if (!isDocType(docType)) return { error: "Tipo inválido" }
    await saveSeries(ctx, docType, String(formData.get("series") ?? ""))
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function saveGrantsAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    assertCan(ctx, "permissions")
    const wanted = new Set(formData.getAll("grant").map(String))
    await prisma.$transaction(async (tx) => {
      await tx.permissionGrant.deleteMany({ where: { businessId: ctx.businessId } })
      const rows = []
      for (const role of ROLES) {
        if (role === "OWNER") continue
        for (const permission of PERMISSIONS) {
          const allowed = wanted.has(`${role}|${permission}`)
          if (allowed !== can(role, permission)) rows.push({ businessId: ctx.businessId, role, permission, allowed })
        }
      }
      if (rows.length) await tx.permissionGrant.createMany({ data: rows })
      await tx.auditLog.create({
        data: { businessId: ctx.businessId, userId: ctx.userId, action: "PERMISSIONS", entity: "PermissionGrant", detail: String(rows.length) },
      })
    })
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}
