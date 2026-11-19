"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { errorMessage } from "@/lib/errors"
import { confirmSale, readDraft, returnSale, saveDraft, voidSale } from "@/lib/sales"
import { requireTenant } from "@/lib/tenant"
import type { SaleConfirmInput, SaleDraftInput } from "@/lib/types"

function fail(error: unknown) {
  unstable_rethrow(error)
  return { ok: false as const, error: errorMessage(error) }
}

export async function confirmSaleAction(input: SaleConfirmInput) {
  try {
    const ctx = await requireTenant()
    const sale = await confirmSale(ctx, input)
    revalidatePath("/")
    revalidatePath("/ventas")
    revalidatePath("/inventario")
    revalidatePath("/caja")
    return { ok: true as const, id: sale.id }
  } catch (error) {
    return fail(error)
  }
}

export async function getDraftAction(id: string) {
  try {
    const ctx = await requireTenant()
    const draft = await readDraft(ctx, id)
    return { ok: true as const, draft }
  } catch (error) {
    return fail(error)
  }
}

export async function saveDraftAction(input: SaleDraftInput) {
  try {
    const ctx = await requireTenant()
    const sale = await saveDraft(ctx, input)
    revalidatePath("/ventas/pendientes")
    return { ok: true as const, id: sale.id }
  } catch (error) {
    return fail(error)
  }
}

export async function voidSaleAction(saleId: string, reason: string, stockMode: "restore" | "keep" = "restore") {
  try {
    const ctx = await requireTenant()
    await voidSale(ctx, saleId, reason, stockMode)
    revalidatePath("/ventas")
    revalidatePath("/inventario")
    revalidatePath("/")
    return { ok: true as const }
  } catch (error) {
    return fail(error)
  }
}

export async function returnSaleAction(input: { saleId: string; refundMethod: "CASH" | "CREDIT"; lines: { saleLineId: string; quantity: string }[] }) {
  try {
    const ctx = await requireTenant()
    await returnSale(ctx, input)
    revalidatePath("/ventas")
    revalidatePath("/inventario")
    revalidatePath("/caja")
    return { ok: true as const }
  } catch (error) {
    return fail(error)
  }
}
