import { mkdir, writeFile } from "node:fs/promises"
import { uploadsDir } from "@/lib/storage"
import path from "node:path"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { assertNoCode } from "@/lib/guard"
import { formatQty, fromMoneyInt, fromQtyInt, toMoneyInt, toQtyInt, toFactorInt } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { CatalogProduct, TenantContext } from "@/lib/types"

export type PresentationInput = {
  id?: string
  name: string
  factorToBase: string
  unitId?: string
  price?: string
  barcode?: string
  isDefault: boolean
}

export type ProductInput = {
  id?: string
  name: string
  internalCode?: string
  categoryId?: string
  brandId?: string
  brandName?: string
  baseUnitId: string
  description?: string
  costPrice: string
  salePrice: string
  wholesalePrice: string
  retailPrice: string
  minStock: string
  maxStock?: string
  trackLots: boolean
  isActive: boolean
  barcodes: string[]
  presentations: PresentationInput[]
}

function cleanCode(code: string) {
  return code.trim().replace(/\s+/g, "")
}

function upperName(value: string) {
  return value.trim().toLocaleUpperCase("es-PE")
}

function makeInternalCode(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8)
  return `${base || "PRD"}-${Math.floor(1000 + Math.random() * 9000)}`
}

async function ownedCategory(businessId: string, id?: string) {
  if (!id) return null
  const row = await prisma.category.findFirst({ where: { id, businessId } })
  if (!row) throw new AppError("Categoría no encontrada")
  return row.id
}

async function ownedBrand(businessId: string, id?: string) {
  if (!id) return null
  const row = await prisma.brand.findFirst({ where: { id, businessId } })
  if (!row) throw new AppError("Marca no encontrada")
  return row.id
}

async function brandByName(businessId: string, name: string) {
  const clean = name.trim()
  if (!clean) return null
  const current = await prisma.brand.findFirst({ where: { businessId, name: clean } })
  if (current) return current.id
  try {
    const created = await prisma.brand.create({ data: { businessId, name: clean } })
    return created.id
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await prisma.brand.findFirst({ where: { businessId, name: clean } })
      if (again) return again.id
    }
    throw error
  }
}

export async function saveProduct(ctx: TenantContext, input: ProductInput) {
  assertCan(ctx, "catalogWrite")
  const name = upperName(input.name)
  assertNoCode(name)
  if (input.brandName) assertNoCode(input.brandName)
  for (const item of input.presentations) assertNoCode(item.name)
  if (name.length < 2) throw new AppError("Indica el nombre del producto")
  const unit = await prisma.unit.findFirst({ where: { id: input.baseUnitId, businessId: ctx.businessId } })
  if (!unit) throw new AppError("Unidad base no encontrada")
  const categoryId = await ownedCategory(ctx.businessId, input.categoryId)
  const brandId = input.brandName !== undefined ? await brandByName(ctx.businessId, input.brandName) : await ownedBrand(ctx.businessId, input.brandId)
  const presentations = input.presentations.filter((item) => item.name.trim())
  if (presentations.length === 0) {
    presentations.push({ name: unit.name, factorToBase: "1", isDefault: true })
  }
  if (!presentations.some((item) => item.isDefault)) presentations[0].isDefault = true
  const prices = {
    costPrice: toMoneyInt(input.costPrice || "0"),
    salePrice: toMoneyInt(input.salePrice || "0"),
    wholesalePrice: toMoneyInt(input.wholesalePrice || "0"),
    retailPrice: toMoneyInt(input.retailPrice || "0"),
    minStock: toQtyInt(input.minStock || "0"),
    maxStock: input.maxStock ? toQtyInt(input.maxStock) : null,
  }
  const internalCode = input.internalCode?.trim() || makeInternalCode(name)

  try {
    return await prisma.$transaction(async (tx) => {
      const data = {
        name,
        internalCode,
        categoryId,
        brandId,
        baseUnitId: unit.id,
        description: input.description?.trim() || null,
        trackLots: input.trackLots,
        isActive: input.isActive,
        ...prices,
      }
      let product
      let priceChanged = [prices.costPrice, prices.salePrice, prices.wholesalePrice, prices.retailPrice].some((value) => value !== 0)
        || presentations.some((item) => item.price ? toMoneyInt(item.price) !== 0 : false)
      if (input.id) {
        const current = await tx.product.findFirst({ where: { id: input.id, businessId: ctx.businessId } })
        if (!current) throw new AppError("Producto no encontrado")
        const currentPresentations = await tx.presentation.findMany({
          where: { productId: current.id, businessId: ctx.businessId, isActive: true },
        })
        priceChanged = current.costPrice !== prices.costPrice
          || current.salePrice !== prices.salePrice
          || current.wholesalePrice !== prices.wholesalePrice
          || current.retailPrice !== prices.retailPrice
        for (const item of presentations) {
          const nextPrice = item.price ? toMoneyInt(item.price) : null
          const previous = item.id ? currentPresentations.find((row) => row.id === item.id) : undefined
          if (!previous) {
            if (nextPrice) priceChanged = true
          } else if (previous.price !== nextPrice) priceChanged = true
        }
        if (priceChanged) assertCan(ctx, "priceWrite")
        product = await tx.product.update({ where: { id: current.id }, data })
      } else {
        if (priceChanged) assertCan(ctx, "priceWrite")
        product = await tx.product.create({ data: { ...data, businessId: ctx.businessId } })
      }

      const kept = new Set<string>()
      for (const item of presentations) {
        const payload = {
          name: item.name.trim(),
          factorToBase: toFactorInt(item.factorToBase),
          unitId: item.unitId || null,
          price: item.price ? toMoneyInt(item.price) : null,
          isDefault: item.isDefault,
          isActive: true,
        }
        if (item.unitId) {
          const presentationUnit = await tx.unit.findFirst({ where: { id: item.unitId, businessId: ctx.businessId } })
          if (!presentationUnit) throw new AppError("Unidad de presentación no encontrada")
        }
        let saved
        if (item.id) {
          const current = await tx.presentation.findFirst({
            where: { id: item.id, productId: product.id, businessId: ctx.businessId },
          })
          if (!current) throw new AppError("Presentación no encontrada")
          saved = await tx.presentation.update({ where: { id: current.id }, data: payload })
        } else {
          saved = await tx.presentation.create({
            data: { ...payload, businessId: ctx.businessId, productId: product.id },
          })
        }
        kept.add(saved.id)
        item.id = saved.id
      }
      await tx.presentation.updateMany({
        where: { productId: product.id, businessId: ctx.businessId, id: { notIn: [...kept] } },
        data: { isActive: false, isDefault: false },
      })
      await tx.productBarcode.deleteMany({ where: { productId: product.id, businessId: ctx.businessId } })
      const codes = new Set<string>()
      for (const code of input.barcodes.map(cleanCode).filter(Boolean)) {
        if (codes.has(code)) continue
        codes.add(code)
        await tx.productBarcode.create({
          data: { businessId: ctx.businessId, productId: product.id, code },
        })
      }
      for (const item of presentations) {
        const code = cleanCode(item.barcode ?? "")
        if (!code || !item.id || codes.has(code)) continue
        codes.add(code)
        await tx.productBarcode.create({
          data: { businessId: ctx.businessId, productId: product.id, presentationId: item.id, code },
        })
      }
      return product
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("El código interno o el código de barras ya existe en este negocio")
    }
    throw error
  }
}

export async function saveProductImage(ctx: TenantContext, productId: string, file: File) {
  assertCan(ctx, "catalogWrite")
  if (!file || file.size === 0) return
  if (file.size > 2_000_000) throw new AppError("La imagen supera 2 MB")
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }
  const ext = extensions[file.type]
  if (!ext) throw new AppError("Usa una imagen JPG, PNG o WebP")
  const product = await prisma.product.findFirst({ where: { id: productId, businessId: ctx.businessId } })
  if (!product) throw new AppError("Producto no encontrado")
  const dir = uploadsDir()
  await mkdir(dir, { recursive: true })
  const filename = `${ctx.businessId}-${productId}.${ext}`
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()))
  await prisma.product.updateMany({
    where: { id: productId, businessId: ctx.businessId },
    data: { imagePath: `/uploads/${filename}?v=${Date.now()}` },
  })
}

export async function createVariant(
  ctx: TenantContext,
  parentId: string,
  input: { name: string; internalCode?: string; costPrice: string; salePrice: string; retailPrice: string; wholesalePrice: string; barcode?: string },
) {
  const parent = await prisma.product.findFirst({ where: { id: parentId, businessId: ctx.businessId, parentId: null } })
  if (!parent) throw new AppError("Producto base no encontrado")
  const variantName = upperName(input.name)
  if (!variantName) throw new AppError("Indica el nombre de la variante")
  return saveProduct(ctx, {
    name: `${parent.name} ${variantName}`,
    internalCode: input.internalCode,
    categoryId: parent.categoryId ?? undefined,
    brandId: parent.brandId ?? undefined,
    baseUnitId: parent.baseUnitId,
    costPrice: input.costPrice,
    salePrice: input.salePrice,
    retailPrice: input.retailPrice,
    wholesalePrice: input.wholesalePrice,
    minStock: "0",
    trackLots: parent.trackLots,
    isActive: true,
    barcodes: input.barcode ? [input.barcode] : [],
    presentations: [{ name: "Unidad", factorToBase: "1", isDefault: true }],
  }).then(async (product) => {
    await prisma.product.updateMany({
      where: { id: product.id, businessId: ctx.businessId },
      data: { parentId: parent.id, variantName },
    })
    return product
  })
}

const catalogInclude = {
  category: true,
  brand: true,
  baseUnit: true,
  barcodes: true,
  presentations: { where: { isActive: true }, include: { unit: true } },
  variants: { select: { id: true, isActive: true } },
  balances: true,
} satisfies Prisma.ProductInclude

export async function loadCatalog(ctx: TenantContext): Promise<CatalogProduct[]> {
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId },
    include: {
      ...catalogInclude,
      balances: { where: { warehouseId: ctx.warehouseId } },
    },
    orderBy: { name: "asc" },
  })
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    internalCode: product.internalCode,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    brandName: product.brand?.name ?? null,
    baseUnitId: product.baseUnitId,
    baseUnit: product.baseUnit.symbol,
    costPrice: fromMoneyInt(product.costPrice).toFixed(2),
    salePrice: fromMoneyInt(product.salePrice).toFixed(2),
    retailPrice: fromMoneyInt(product.retailPrice).toFixed(2),
    wholesalePrice: fromMoneyInt(product.wholesalePrice).toFixed(2),
    stock: formatQty(product.balances[0]?.quantity ?? 0),
    minStock: formatQty(product.minStock),
    isActive: product.isActive,
    parentId: product.parentId,
    variantName: product.variantName,
    hasVariants: product.variants.some((variant) => variant.isActive),
    trackLots: product.trackLots,
    imagePath: product.imagePath,
    barcodes: product.barcodes.map((barcode) => ({
      code: barcode.code,
      presentationId: barcode.presentationId ?? "",
    })),
    presentations: product.presentations.map((presentation) => ({
      id: presentation.id,
      name: presentation.name,
      factorToBase: formatQty(presentation.factorToBase),
      price: presentation.price == null ? null : fromMoneyInt(presentation.price).toFixed(2),
      isDefault: presentation.isDefault,
      unitSymbol: presentation.unit?.symbol ?? null,
    })),
  }))
}

export async function getProductForm(ctx: TenantContext, id: string) {
  const product = await prisma.product.findFirst({
    where: { id, businessId: ctx.businessId },
    include: { brand: true, barcodes: true, presentations: { where: { isActive: true }, include: { unit: true } }, variants: true },
  })
  if (!product) throw new AppError("Producto no encontrado")
  const presentationCodes = new Map(
    product.barcodes.filter((barcode) => barcode.presentationId).map((barcode) => [barcode.presentationId, barcode.code]),
  )
  return {
    product,
    values: {
      id: product.id,
      name: product.name,
      internalCode: product.internalCode,
      categoryId: product.categoryId ?? "",
      brandName: product.brand?.name ?? "",
      baseUnitId: product.baseUnitId,
      description: product.description ?? "",
      costPrice: fromMoneyInt(product.costPrice).toFixed(2),
      salePrice: fromMoneyInt(product.salePrice).toFixed(2),
      wholesalePrice: fromMoneyInt(product.wholesalePrice).toFixed(2),
      retailPrice: fromMoneyInt(product.retailPrice).toFixed(2),
      minStock: formatQty(product.minStock),
      maxStock: product.maxStock == null ? "" : formatQty(product.maxStock),
      trackLots: product.trackLots,
      isActive: product.isActive,
      barcodes: product.barcodes.filter((barcode) => !barcode.presentationId).map((barcode) => barcode.code),
      presentations: product.presentations.map((presentation) => ({
        id: presentation.id,
        name: presentation.name,
        factorToBase: formatQty(presentation.factorToBase),
        unitId: presentation.unitId ?? "",
        price: presentation.price == null ? "" : fromMoneyInt(presentation.price).toFixed(2),
        barcode: presentationCodes.get(presentation.id) ?? "",
        isDefault: presentation.isDefault,
      })),
    },
  }
}

export async function saveNamed(ctx: TenantContext, kind: "category" | "brand", name: string, id?: string) {
  assertCan(ctx, "catalogWrite")
  const clean = kind === "category" ? upperName(name) : name.trim()
  if (clean.length < 2) throw new AppError("Indica un nombre")
  try {
    if (kind === "category") {
      return id
        ? prisma.category.updateMany({ where: { id, businessId: ctx.businessId }, data: { name: clean } })
        : prisma.category.create({ data: { businessId: ctx.businessId, name: clean } })
    }
    return id
      ? prisma.brand.updateMany({ where: { id, businessId: ctx.businessId }, data: { name: clean } })
      : prisma.brand.create({ data: { businessId: ctx.businessId, name: clean } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Ese nombre ya existe")
    }
    throw error
  }
}

export async function saveUnit(
  ctx: TenantContext,
  input: { id?: string; name: string; symbol: string; dimension: string },
) {
  assertCan(ctx, "catalogWrite")
  const name = input.name.trim()
  const symbol = input.symbol.trim()
  if (!name || !symbol) throw new AppError("Indica nombre y símbolo")
  if (!["UNIT", "WEIGHT", "LENGTH", "VOLUME"].includes(input.dimension)) throw new AppError("Dimensión inválida")
  try {
    if (input.id) {
      const updated = await prisma.unit.updateMany({
        where: { id: input.id, businessId: ctx.businessId },
        data: { name, symbol, dimension: input.dimension },
      })
      if (updated.count !== 1) throw new AppError("Unidad no encontrada")
      return
    }
    await prisma.unit.create({ data: { businessId: ctx.businessId, name, symbol, dimension: input.dimension } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Ese símbolo ya existe")
    }
    throw error
  }
}

export async function savePriceListItem(
  ctx: TenantContext,
  input: { listId: string; productId: string; presentationId?: string; price: string },
) {
  assertCan(ctx, "priceWrite")
  const list = await prisma.priceList.findFirst({ where: { id: input.listId, businessId: ctx.businessId } })
  if (!list) throw new AppError("Lista no encontrada")
  const product = await prisma.product.findFirst({ where: { id: input.productId, businessId: ctx.businessId } })
  if (!product) throw new AppError("Producto no encontrado")
  const presentationId = input.presentationId ?? ""
  if (presentationId) {
    const presentation = await prisma.presentation.findFirst({
      where: { id: presentationId, productId: product.id, businessId: ctx.businessId },
    })
    if (!presentation) throw new AppError("Presentación no encontrada")
  }
  await prisma.priceListItem.upsert({
    where: {
      priceListId_productId_presentationId: { priceListId: list.id, productId: product.id, presentationId },
    },
    create: { priceListId: list.id, productId: product.id, presentationId, price: toMoneyInt(input.price) },
    update: { price: toMoneyInt(input.price) },
  })
}

export async function createPriceList(ctx: TenantContext, name: string) {
  assertCan(ctx, "catalogWrite")
  const clean = name.trim()
  if (clean.length < 2) throw new AppError("Indica el nombre de la lista")
  try {
    return await prisma.priceList.create({ data: { businessId: ctx.businessId, name: clean } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Esa lista ya existe")
    }
    throw error
  }
}

export async function addBarcode(ctx: TenantContext, productId: string, code: string, presentationId?: string) {
  assertCan(ctx, "catalogWrite")
  const product = await prisma.product.findFirst({ where: { id: productId, businessId: ctx.businessId } })
  if (!product) throw new AppError("Producto no encontrado")
  const clean = cleanCode(code)
  if (!clean) throw new AppError("Indica el código")
  try {
    return await prisma.productBarcode.create({
      data: {
        businessId: ctx.businessId,
        productId,
        presentationId: presentationId || null,
        code: clean,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Ese código ya está registrado en este negocio")
    }
    throw error
  }
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const source = text.replace(/^\uFEFF/, "")
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else quoted = false
      } else cell += char
    } else if (char === '"') quoted = true
    else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (char !== "\r") cell += char
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((item) => item.some((value) => value.trim()))
}

export async function exportCatalogCsv(ctx: TenantContext) {
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId },
    include: { category: true, brand: true, baseUnit: true, barcodes: true, presentations: { where: { isActive: true } } },
    orderBy: { name: "asc" },
  })
  const header = [
    "internalCode",
    "name",
    "category",
    "brand",
    "unit",
    "costPrice",
    "salePrice",
    "wholesalePrice",
    "retailPrice",
    "barcode",
    "minStock",
    "presentation",
    "factor",
    "presentationPrice",
  ]
  const lines = [header.join(",")]
  for (const product of products) {
    const barcode = product.barcodes.find((item) => !item.presentationId)?.code ?? ""
    const presentation = product.presentations.find((item) => item.isDefault) ?? product.presentations[0]
    const values = [
      product.internalCode,
      product.name,
      product.category?.name ?? "",
      product.brand?.name ?? "",
      product.baseUnit.symbol,
      fromMoneyInt(product.costPrice).toFixed(2),
      fromMoneyInt(product.salePrice).toFixed(2),
      fromMoneyInt(product.wholesalePrice).toFixed(2),
      fromMoneyInt(product.retailPrice).toFixed(2),
      barcode,
      fromQtyInt(product.minStock).toFixed(4),
      presentation?.name ?? "",
      presentation ? fromQtyInt(presentation.factorToBase).toFixed(4) : "",
      presentation?.price == null ? "" : fromMoneyInt(presentation.price).toFixed(2),
    ]
    lines.push(values.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
  }
  return lines.join("\n")
}

export async function importCatalogCsv(ctx: TenantContext, text: string) {
  assertCan(ctx, "catalogWrite")
  const rows = parseCsv(text)
  if (rows.length < 2) throw new AppError("El archivo no tiene productos")
  const header = rows[0].map((cell) => cell.trim())
  const index = (name: string) => header.indexOf(name)
  if (index("name") < 0 || index("unit") < 0) throw new AppError("Faltan las columnas name y unit")
  let created = 0
  let updated = 0
  for (const row of rows.slice(1)) {
    const read = (name: string) => row[index(name)]?.trim() ?? ""
    const unit = await prisma.unit.findFirst({ where: { businessId: ctx.businessId, symbol: read("unit") } })
    if (!unit) throw new AppError(`Unidad no registrada: ${read("unit")}`)
    let categoryId: string | undefined
    if (read("category")) {
      const categoryName = upperName(read("category"))
      const category = await prisma.category.upsert({
        where: { businessId_name: { businessId: ctx.businessId, name: categoryName } },
        create: { businessId: ctx.businessId, name: categoryName },
        update: {},
      })
      categoryId = category.id
    }
    let brandId: string | undefined
    if (read("brand")) {
      const brand = await prisma.brand.upsert({
        where: { businessId_name: { businessId: ctx.businessId, name: read("brand") } },
        create: { businessId: ctx.businessId, name: read("brand") },
        update: {},
      })
      brandId = brand.id
    }
    const existing = read("internalCode")
      ? await prisma.product.findFirst({ where: { businessId: ctx.businessId, internalCode: read("internalCode") } })
      : null
    const presentations: PresentationInput[] = [
      {
        name: read("presentation") || unit.name,
        factorToBase: read("factor") || "1",
        price: read("presentationPrice") || undefined,
        isDefault: true,
      },
    ]
    if (existing) {
      const current = await getProductForm(ctx, existing.id)
      presentations[0].id = current.values.presentations[0]?.id
    }
    await saveProduct(ctx, {
      id: existing?.id,
      name: read("name"),
      internalCode: read("internalCode") || undefined,
      categoryId,
      brandId,
      baseUnitId: unit.id,
      costPrice: read("costPrice") || "0",
      salePrice: read("salePrice") || "0",
      wholesalePrice: read("wholesalePrice") || "0",
      retailPrice: read("retailPrice") || "0",
      minStock: read("minStock") || "0",
      trackLots: false,
      isActive: true,
      barcodes: read("barcode") ? [read("barcode")] : [],
      presentations,
    })
    if (existing) updated += 1
    else created += 1
  }
  return { created, updated }
}
