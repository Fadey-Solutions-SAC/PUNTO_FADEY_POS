"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { unstable_rethrow } from "next/navigation"
import { addMovement, closeSession, createRegister, openSession, removeRegister } from "@/lib/cash"
import { saveCustomer, registerAbono } from "@/lib/customers"
import { errorMessage } from "@/lib/errors"
import { adjustStock, cancelTransfer, receiveEntries, receiveTransfer, sendTransfer, setStock, stockIn, stockOut } from "@/lib/inventory"
import { saveTheme } from "@/lib/appearance"
import { eraseAllData } from "@/lib/backup"
import { saveBrandLogo, saveLoginCover } from "@/lib/cover"
import { assertAttempts, assertNoCode, configPasswordOk, noteAttempt } from "@/lib/guard"
import { assertCan } from "@/lib/roles"
import { createPaymentMethod, deletePaymentMethod } from "@/lib/payment-methods"
import { saveHardwareReader } from "@/lib/pos-settings"
import { createBranch, createWarehouse, deleteWarehouse, updateBusiness } from "@/lib/settings"
import { createUser, deleteMember, updateMember } from "@/lib/setup"
import { clearSession, readSession, signSession } from "@/lib/session"
import { requireTenant } from "@/lib/tenant"

function formError(error: unknown) {
  unstable_rethrow(error)
  return { error: errorMessage(error) }
}

export async function openCashAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await openSession(ctx, {
      cashRegisterId: String(formData.get("cashRegisterId") ?? ""),
      openingAmount: String(formData.get("openingAmount") ?? "0"),
    })
    revalidatePath("/caja")
    revalidatePath("/ventas")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function movementAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const type = String(formData.get("type") ?? "")
    if (type !== "INCOME" && type !== "EXPENSE" && type !== "WITHDRAWAL" && type !== "DEPOSIT") {
      return { error: "Tipo de movimiento inválido" }
    }
    await addMovement(ctx, { type, amount: String(formData.get("amount") ?? ""), reason: String(formData.get("reason") ?? "") })
    revalidatePath("/caja")
    revalidatePath("/ventas")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function closeCashAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await closeSession(ctx, { counted: String(formData.get("counted") ?? ""), notes: String(formData.get("notes") ?? "") })
    revalidatePath("/caja")
    revalidatePath("/ventas")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function closeCashBoardAction(input: { counted: string; notes?: string; arqueoDetail?: string }) {
  try {
    const ctx = await requireTenant()
    await closeSession(ctx, {
      counted: input.counted,
      notes: input.notes,
      arqueoDetail: input.arqueoDetail,
    })
    revalidatePath("/caja")
    revalidatePath("/caja/historial")
    revalidatePath("/ventas")
    return { ok: true as const }
  } catch (error) {
    unstable_rethrow(error)
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function createRegisterAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await createRegister(ctx, String(formData.get("name") ?? ""))
    revalidatePath("/caja")
    revalidatePath("/ventas")
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function stockInAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const type = String(formData.get("type") ?? "ENTRY")
    if (type !== "PURCHASE" && type !== "ENTRY" && type !== "RETURN") return { error: "Tipo inválido" }
    await stockIn(ctx, {
      productId: String(formData.get("productId") ?? ""),
      presentationId: String(formData.get("presentationId") ?? "") || undefined,
      quantity: String(formData.get("quantity") ?? ""),
      type,
      reason: String(formData.get("reason") ?? ""),
      lotCode: String(formData.get("lotCode") ?? ""),
      expiresAt: String(formData.get("expiresAt") ?? ""),
    })
    revalidatePath("/inventario")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function receiveEntriesAction(input: {
  type: "PURCHASE" | "ENTRY" | "RETURN"
  reason?: string
  lines: {
    productId: string
    presentationId?: string
    quantity: string
    unitCost: string
    warehouseId: string
    expiresAt?: string
    lotCode?: string
  }[]
}) {
  try {
    const ctx = await requireTenant()
    await receiveEntries(ctx, input)
    revalidatePath("/inventario")
    revalidatePath("/inventario/alertas")
    return { ok: true as const }
  } catch (error) {
    unstable_rethrow(error)
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function stockOutAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const type = String(formData.get("type") ?? "SHRINKAGE")
    if (type !== "SHRINKAGE" && type !== "LOSS" && type !== "INTERNAL") return { error: "Tipo inválido" }
    await stockOut(ctx, {
      productId: String(formData.get("productId") ?? ""),
      presentationId: String(formData.get("presentationId") ?? "") || undefined,
      quantity: String(formData.get("quantity") ?? ""),
      type,
      reason: String(formData.get("reason") ?? ""),
      lotCode: String(formData.get("lotCode") ?? ""),
    })
    revalidatePath("/inventario")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function setStockAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await setStock(ctx, {
      productId: String(formData.get("productId") ?? ""),
      presentationId: String(formData.get("presentationId") ?? "") || undefined,
      quantity: String(formData.get("quantity") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      lotCode: String(formData.get("lotCode") ?? ""),
      expiresAt: String(formData.get("expiresAt") ?? ""),
    })
    revalidatePath("/inventario")
    revalidatePath("/inventario/ajustes")
    revalidatePath("/inventario/almacenes")
    revalidatePath("/inventario/kardex")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function adjustAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const direction = String(formData.get("direction") ?? "IN")
    if (direction !== "IN" && direction !== "OUT") return { error: "Dirección inválida" }
    await adjustStock(ctx, {
      productId: String(formData.get("productId") ?? ""),
      presentationId: String(formData.get("presentationId") ?? "") || undefined,
      quantity: String(formData.get("quantity") ?? ""),
      direction,
      reason: String(formData.get("reason") ?? ""),
      lotCode: String(formData.get("lotCode") ?? ""),
    })
    revalidatePath("/inventario")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function transferAction(input: { fromWarehouseId?: string; toWarehouseId: string; notes?: string; lines: { productId: string; presentationId?: string; quantity: string }[] }) {
  try {
    const ctx = await requireTenant()
    await sendTransfer(ctx, input)
    revalidatePath("/inventario")
    return { ok: true as const }
  } catch (error) {
    unstable_rethrow(error)
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function receiveTransferAction(id: string) {
  try {
    const ctx = await requireTenant()
    await receiveTransfer(ctx, id)
    revalidatePath("/inventario")
    return { ok: true as const }
  } catch (error) {
    unstable_rethrow(error)
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function cancelTransferAction(id: string) {
  try {
    const ctx = await requireTenant()
    await cancelTransfer(ctx, id)
    revalidatePath("/inventario")
    return { ok: true as const }
  } catch (error) {
    unstable_rethrow(error)
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function saveCustomerAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await saveCustomer(ctx, {
      id: String(formData.get("id") ?? "") || undefined,
      name: String(formData.get("name") ?? ""),
      document: String(formData.get("document") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      address: String(formData.get("address") ?? ""),
      creditLimit: String(formData.get("creditLimit") ?? "0"),
    })
    revalidatePath("/clientes")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function abonoAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const method = String(formData.get("method") ?? "CASH").trim() || "CASH"
    await registerAbono(
      ctx,
      String(formData.get("customerId") ?? ""),
      String(formData.get("amount") ?? ""),
      String(formData.get("saleId") ?? "") || undefined,
      method,
    )
    revalidatePath("/clientes")
    revalidatePath("/clientes/creditos")
    revalidatePath("/caja")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function updateBusinessAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await updateBusiness(ctx, {
      name: String(formData.get("name") ?? ""),
      legalName: String(formData.get("legalName") ?? ""),
      taxId: String(formData.get("taxId") ?? ""),
      currency: String(formData.get("currency") ?? "PEN"),
      discountLimitPct: String(formData.get("discountLimitPct") ?? "10"),
      allowCredit: formData.get("allowCredit") === "on",
    })
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function saveThemeAction(themeId: string) {
  try {
    const ctx = await requireTenant()
    await saveTheme(ctx, themeId)
    revalidatePath("/", "layout")
    revalidatePath("/configuracion")
    return { ok: true as const }
  } catch (error) {
    unstable_rethrow(error)
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function saveLogoAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const file = formData.get("logo")
    if (!(file instanceof File)) return { error: "Elige una imagen de logo" }
    await saveBrandLogo(ctx, file)
    revalidatePath("/", "layout")
    revalidatePath("/login")
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function wipeDataAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    assertCan(ctx, "backup")
    const password = String(formData.get("password") ?? "")
    assertNoCode(password)
    if (formData.get("confirm") !== "on") return { error: "Confirma que deseas borrar todos los datos" }
    await assertAttempts("wipe", 4, 30 * 60 * 1000)
    if (!configPasswordOk(password)) {
      await noteAttempt("wipe", 30 * 60 * 1000)
      return { error: "Contraseña incorrecta" }
    }
    await eraseAllData()
    await clearSession()
  } catch (error) {
    return formError(error)
  }
  redirect("/login")
}

export async function saveCoverAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const file = formData.get("cover")
    if (!(file instanceof File)) return { error: "Elige una imagen de portada" }
    await saveLoginCover(ctx, file)
    revalidatePath("/login")
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function createBranchAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await createBranch(ctx, { name: String(formData.get("name") ?? ""), address: String(formData.get("address") ?? "") })
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function createWarehouseAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await createWarehouse(ctx, String(formData.get("name") ?? ""))
    revalidatePath("/inventario/almacenes")
    revalidatePath("/", "layout")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function deleteWarehouseAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const warehouseId = String(formData.get("warehouseId") ?? "")
    const result = await deleteWarehouse(ctx, warehouseId)
    if (ctx.warehouseId === warehouseId) {
      const session = await readSession()
      if (session) await signSession({ ...session, branchId: result.branchId, warehouseId: result.replacementId })
    }
    revalidatePath("/inventario/almacenes")
    revalidatePath("/", "layout")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function createUserAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await createUser(ctx.businessId, ctx.role, {
      name: String(formData.get("name") ?? ""),
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      role: "CASHIER",
      cashRegisterId: String(formData.get("cashRegisterId") ?? ""),
      permissions: formData.getAll("permission").map(String),
    })
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function updateUserAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const password = String(formData.get("password") ?? "")
    await updateMember(ctx.businessId, ctx.role, {
      userId: String(formData.get("userId") ?? ""),
      name: String(formData.get("name") ?? ""),
      username: String(formData.get("username") ?? ""),
      password: password || undefined,
      cashRegisterId: String(formData.get("cashRegisterId") ?? ""),
      permissions: formData.getAll("permission").map(String),
    })
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function deleteUserAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await deleteMember(ctx.businessId, ctx.role, ctx.userId, String(formData.get("userId") ?? ""))
    revalidatePath("/configuracion")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function deleteRegisterAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await removeRegister(ctx, String(formData.get("registerId") ?? ""))
    revalidatePath("/configuracion")
    revalidatePath("/ventas")
    return { error: "" }
  } catch (error) {
    return formError(error)
  }
}

export async function createPaymentMethodAction(label: string) {
  try {
    const ctx = await requireTenant()
    await createPaymentMethod(ctx, label)
    revalidatePath("/configuracion")
    revalidatePath("/ventas")
    return { ok: true as const }
  } catch (error) {
    unstable_rethrow(error)
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function deletePaymentMethodAction(id: string) {
  try {
    const ctx = await requireTenant()
    await deletePaymentMethod(ctx, id)
    revalidatePath("/configuracion")
    revalidatePath("/ventas")
    return { ok: true as const }
  } catch (error) {
    unstable_rethrow(error)
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function saveHardwareReaderAction(enabled: boolean) {
  try {
    const ctx = await requireTenant()
    await saveHardwareReader(ctx, enabled)
    revalidatePath("/configuracion")
    revalidatePath("/ventas")
    return { ok: true as const }
  } catch (error) {
    unstable_rethrow(error)
    return { ok: false as const, error: errorMessage(error) }
  }
}
