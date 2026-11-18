"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import {
  addBarcode,
  createPriceList,
  createVariant,
  importCatalogCsv,
  saveNamed,
  savePriceListItem,
  saveProduct,
  saveProductImage,
  saveUnit,
  type ProductInput,
} from "@/lib/catalog"
import { errorMessage } from "@/lib/errors"
import { requireTenant } from "@/lib/tenant"

function fail(error: unknown): { ok: false; error: string } {
  unstable_rethrow(error)
  return { ok: false, error: errorMessage(error) }
}

export async function saveProductAction(input: ProductInput) {
  try {
    const ctx = await requireTenant()
    const product = await saveProduct(ctx, input)
    revalidatePath("/productos")
    revalidatePath("/ventas")
    return { ok: true as const, id: product.id }
  } catch (error) {
    return fail(error)
  }
}

export async function uploadImageAction(formData: FormData) {
  try {
    const ctx = await requireTenant()
    const productId = String(formData.get("productId") ?? "")
    const file = formData.get("image")
    if (file instanceof File) await saveProductImage(ctx, productId, file)
    revalidatePath(`/productos/${productId}`)
    revalidatePath("/productos/presentaciones")
    revalidatePath("/ventas")
    revalidatePath("/inventario/almacenes")
    return { ok: true as const }
  } catch (error) {
    return fail(error)
  }
}

export async function saveCategoryAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await saveNamed(ctx, "category", String(formData.get("name") ?? ""))
    revalidatePath("/productos")
    return { error: "" }
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
}

export async function saveBrandAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await saveNamed(ctx, "brand", String(formData.get("name") ?? ""))
    revalidatePath("/productos/marcas")
    return { error: "" }
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
}

export async function saveUnitAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await saveUnit(ctx, {
      name: String(formData.get("name") ?? ""),
      symbol: String(formData.get("symbol") ?? ""),
      dimension: String(formData.get("dimension") ?? ""),
    })
    revalidatePath("/productos/unidades")
    return { error: "" }
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
}

export async function addBarcodeAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await addBarcode(ctx, String(formData.get("productId") ?? ""), String(formData.get("code") ?? ""))
    revalidatePath("/productos/codigos")
    return { error: "" }
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
}

export async function createPriceListAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await createPriceList(ctx, String(formData.get("name") ?? ""))
    revalidatePath("/productos/precios")
    return { error: "" }
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
}

export async function savePriceAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await savePriceListItem(ctx, {
      listId: String(formData.get("listId") ?? ""),
      productId: String(formData.get("productId") ?? ""),
      presentationId: String(formData.get("presentationId") ?? ""),
      price: String(formData.get("price") ?? ""),
    })
    revalidatePath("/productos/precios")
    return { error: "" }
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
}

export async function importCatalogAction(_prev: { error: string; message: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    const file = formData.get("file")
    if (!(file instanceof File)) return { error: "Selecciona un archivo CSV", message: "" }
    const result = await importCatalogCsv(ctx, await file.text())
    revalidatePath("/productos")
    return { error: "", message: `Importados ${result.created}, actualizados ${result.updated}` }
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error), message: "" }
  }
}

export async function createVariantAction(_prev: { error: string }, formData: FormData) {
  try {
    const ctx = await requireTenant()
    await createVariant(ctx, String(formData.get("parentId") ?? ""), {
      name: String(formData.get("name") ?? ""),
      internalCode: String(formData.get("internalCode") ?? ""),
      costPrice: String(formData.get("costPrice") ?? "0"),
      salePrice: String(formData.get("salePrice") ?? "0"),
      retailPrice: String(formData.get("retailPrice") ?? "0"),
      wholesalePrice: String(formData.get("wholesalePrice") ?? "0"),
      barcode: String(formData.get("barcode") ?? ""),
    })
    revalidatePath("/productos")
    return { error: "" }
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
}
