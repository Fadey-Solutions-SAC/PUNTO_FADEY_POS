import ExcelJS from "exceljs"
import { getProductForm, saveProduct } from "@/lib/catalog"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { formatQty, fromMoneyInt, toMoneyInt, toQtyInt } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

/**
 * Plantilla Excel de productos (Productos y marcas): se descargan todos los productos activos con sus datos
 * y filas vacías al final para productos nuevos. Al subirla se comparan los datos y solo se guarda
 * lo que cambió y lo nuevo.
 */

const BLANK_ROWS = 60
const TAX_LABEL: Record<string, string> = { EXONERADO: "Exonerado", GRAVADO: "Gravado", INAFECTO: "Inafecto" }

const COLUMNS = [
  { key: "barcode", header: "Código de barras", width: 17 },
  { key: "name", header: "Producto", width: 44 },
  { key: "brand", header: "Marca", width: 18 },
  { key: "unit", header: "Unidad", width: 9 },
  { key: "cost", header: "Precio compra", width: 13 },
  { key: "price", header: "Precio venta", width: 13 },
  { key: "min", header: "Stock mínimo", width: 12 },
  { key: "tax", header: "Impuesto", width: 13 },
  { key: "stock", header: "Stock inicial (solo nuevos)", width: 15 },
  { key: "code", header: "Código interno", width: 16 },
  { key: "id", header: "ID (no modificar)", width: 28 },
] as const
type Key = (typeof COLUMNS)[number]["key"]
const col = (key: Key) => COLUMNS.findIndex((item) => item.key === key) + 1

async function activeProducts(ctx: TenantContext) {
  return prisma.product.findMany({
    where: { businessId: ctx.businessId, isActive: true },
    include: { brand: true, baseUnit: true, barcodes: { where: { presentationId: null } }, balances: { select: { quantity: true } } },
    orderBy: { name: "asc" },
  })
}

export async function buildProductSheet(ctx: TenantContext) {
  assertCan(ctx, "catalogWrite")
  const [products, units] = await Promise.all([
    activeProducts(ctx),
    prisma.unit.findMany({ where: { businessId: ctx.businessId }, orderBy: { symbol: "asc" }, select: { symbol: true } }),
  ])
  const book = new ExcelJS.Workbook()
  book.creator = "Punto Fadey"
  const sheet = book.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1 }] })
  sheet.columns = COLUMNS.map((item) => ({ header: item.header, width: item.width }))

  for (const product of products) {
    sheet.addRow([
      product.barcodes[0]?.code ?? "",
      product.name,
      product.brand?.name ?? "",
      product.baseUnit.symbol,
      Number(fromMoneyInt(product.costPrice).toFixed(2)),
      Number(fromMoneyInt(product.salePrice).toFixed(2)),
      Number(formatQty(product.minStock)),
      TAX_LABEL[product.taxType] ?? product.taxType,
      null,
      product.internalCode,
      product.id,
    ])
  }
  const firstBlank = sheet.rowCount + 1
  for (let i = 0; i < BLANK_ROWS; i++) sheet.addRow([])
  const lastRow = sheet.rowCount

  // Cuadro con líneas: encabezado oscuro; filas de productos en blanco; filas nuevas en verde claro.
  const border = { style: "thin" as const, color: { argb: "FF94A3B8" } }
  for (let r = 1; r <= lastRow; r++) {
    const row = sheet.getRow(r)
    for (let c = 1; c <= COLUMNS.length; c++) {
      const cell = row.getCell(c)
      const key = COLUMNS[c - 1].key
      cell.border = { top: border, left: border, bottom: border, right: border }
      if (r === 1) {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: key === "id" ? "FF64748B" : "FF1E293B" } }
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
        continue
      }
      const isNew = r >= firstBlank
      if (isNew) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } }
      else if (key === "stock") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }
      if (key === "barcode" || key === "code") cell.numFmt = "@"
      if (key === "cost" || key === "price") cell.numFmt = "0.00"
      if (key === "min" || key === "stock") cell.numFmt = "0.####"
      if (key === "id") cell.font = { color: { argb: "FF94A3B8" }, size: 8 }
      if (key === "tax") cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"Exonerado,Gravado,Inafecto"'] }
      if (key === "unit" && units.length) cell.dataValidation = { type: "list", allowBlank: true, formulae: [`"${units.map((u) => u.symbol).join(",")}"`] }
    }
  }
  sheet.getRow(1).height = 32
  if (sheet.rowCount >= firstBlank) {
    sheet.getCell(firstBlank, col("name")).note = "Desde aquí: escribe los productos nuevos (deja vacío el ID)."
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } }
  return Buffer.from(await book.xlsx.writeBuffer())
}

function text(value: ExcelJS.CellValue): string {
  if (value == null) return ""
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString()
    if ("result" in value) return text((value as { result?: ExcelJS.CellValue }).result ?? null)
    if ("richText" in value) return (value as ExcelJS.CellRichTextValue).richText.map((part) => part.text).join("")
    if ("text" in value) return String((value as { text: unknown }).text ?? "")
    return ""
  }
  if (typeof value === "number") return String(Number(value.toFixed(6)))
  return String(value).trim()
}

const upper = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase("es-PE")
const money = (value: string) => value.replace(/[^0-9.,-]/g, "").replace(",", ".")
const qty = (value: string) => value.replace(/\s/g, "").replace(",", ".")

function taxOf(value: string) {
  const t = value.trim().toLowerCase()
  if (!t) return ""
  if (t.startsWith("exo")) return "EXONERADO"
  if (t.startsWith("ina")) return "INAFECTO"
  if (t.startsWith("gra") || t === "igv") return "GRAVADO"
  return "?"
}

export type ProductSheetRow = {
  kind: "new" | "update"
  line: number
  id?: string
  name: string
  changes: string[]
  values: { barcode: string; name: string; brand: string; unitId: string; cost: string; price: string; min: string; tax: string; stock: string; code: string }
}

/** Lee la plantilla y devuelve los productos nuevos y los cambios en los existentes (sin guardar). */
export async function readProductSheet(ctx: TenantContext, file: Buffer) {
  assertCan(ctx, "catalogWrite")
  const book = new ExcelJS.Workbook()
  try {
    await book.xlsx.load(file as unknown as ArrayBuffer)
  } catch {
    throw new AppError("No se pudo leer el archivo. Sube la plantilla en formato Excel (.xlsx).")
  }
  const sheet = book.worksheets[0]
  if (!sheet) throw new AppError("El archivo no tiene hojas")

  // Ubica las columnas por su encabezado (por si el usuario las movió).
  const where = new Map<Key, number>()
  sheet.getRow(1).eachCell((cell, c) => {
    const h = text(cell.value).toLowerCase()
    const found = COLUMNS.find((item) => h === item.header.toLowerCase() || (item.key === "id" && h.startsWith("id")) || (item.key === "stock" && h.startsWith("stock inicial")))
    if (found && !where.has(found.key)) where.set(found.key, c)
  })
  if (!where.has("name")) throw new AppError("No encontré la columna Producto. Usa la plantilla descargada desde Productos.")

  const [products, units] = await Promise.all([activeProducts(ctx), prisma.unit.findMany({ where: { businessId: ctx.businessId } })])
  const allProducts = await prisma.product.findMany({ where: { businessId: ctx.businessId }, select: { id: true, name: true, internalCode: true, isActive: true } })
  const byId = new Map(products.map((p) => [p.id, p]))
  const unitBy = (value: string) => {
    const t = value.trim().toLowerCase()
    return units.find((u) => u.symbol.toLowerCase() === t || u.name.toLowerCase() === t)
  }
  const defaultUnit = unitBy("und") ?? units[0]

  const rows: ProductSheetRow[] = []
  const errors: string[] = []
  const seenNames = new Map<string, number>()
  const seenBarcodes = new Map<string, number>()
  const barcodeOwner = new Map<string, string>()
  for (const code of await prisma.productBarcode.findMany({ where: { businessId: ctx.businessId }, select: { code: true, productId: true } })) {
    barcodeOwner.set(code.code, code.productId)
  }

  sheet.eachRow((row, line) => {
    if (line === 1) return
    const read = (key: Key) => (where.has(key) ? text(row.getCell(where.get(key)!).value) : "")
    const id = read("id")
    const name = upper(read("name"))
    const anything = COLUMNS.some((item) => item.key !== "id" && read(item.key))
    if (!id && !anything) return
    const existing = id ? byId.get(id) : undefined
    if (id && !existing) {
      errors.push(`Fila ${line}: el ID no corresponde a un producto activo, se ignoró (${name || id})`)
      return
    }
    if (!name) {
      errors.push(`Fila ${line}: falta el nombre del producto`)
      return
    }
    const rowErrors: string[] = []
    const unitText = read("unit")
    const unit = unitText ? unitBy(unitText) : existing ? units.find((u) => u.id === existing.baseUnitId) : defaultUnit
    if (!unit) rowErrors.push(`unidad "${unitText}" no registrada`)
    const tax = taxOf(read("tax"))
    if (tax === "?") rowErrors.push(`impuesto "${read("tax")}" no válido (Exonerado, Gravado o Inafecto)`)
    for (const [key, label] of [["cost", "precio compra"], ["price", "precio venta"], ["min", "stock mínimo"], ["stock", "stock inicial"]] as const) {
      const v = read(key)
      const clean = key === "cost" || key === "price" ? money(v) : qty(v)
      if (v && (!/[0-9]/.test(clean) || !(Number(clean) >= 0))) rowErrors.push(`${label} "${v}" no es un número válido`)
    }
    const barcode = read("barcode").replace(/\s+/g, "")
    if (barcode) {
      const owner = barcodeOwner.get(barcode)
      if (owner && owner !== existing?.id) rowErrors.push(`el código de barras ${barcode} ya es de otro producto`)
      const prev = seenBarcodes.get(barcode)
      if (prev) rowErrors.push(`código de barras repetido (también en la fila ${prev})`)
      seenBarcodes.set(barcode, line)
    }
    const prevName = seenNames.get(name)
    if (prevName) rowErrors.push(`nombre repetido (también en la fila ${prevName})`)
    seenNames.set(name, line)
    if (!existing) {
      const same = allProducts.find((p) => upper(p.name) === name)
      if (same) rowErrors.push(same.isActive ? "ya existe un producto con ese nombre (edítalo en su fila)" : "ya existe un producto anulado con ese nombre (restáuralo en Productos)")
    }
    if (rowErrors.length) {
      errors.push(`Fila ${line} (${name}): ${rowErrors.join("; ")}`)
      return
    }
    const values = {
      barcode,
      name,
      brand: upper(read("brand")),
      unitId: unit!.id,
      cost: money(read("cost")),
      price: money(read("price")),
      min: qty(read("min")),
      tax,
      stock: qty(read("stock")),
      code: read("code"),
    }
    if (!existing) {
      rows.push({ kind: "new", line, name, changes: [], values })
      return
    }
    // Cambios respecto a lo guardado (una celda vacía no borra el dato).
    const changes: string[] = []
    const moneyText = (cents: number) => fromMoneyInt(cents).toFixed(2)
    if (name !== existing.name) changes.push(`Nombre: ${existing.name} → ${name}`)
    if (values.brand && values.brand !== upper(existing.brand?.name ?? "")) changes.push(`Marca: ${existing.brand?.name ?? "—"} → ${values.brand}`)
    if (unit!.id !== existing.baseUnitId) changes.push(`Unidad: ${existing.baseUnit.symbol} → ${unit!.symbol}`)
    if (values.cost && toMoneyInt(values.cost) !== existing.costPrice) changes.push(`Precio compra: ${moneyText(existing.costPrice)} → ${Number(values.cost).toFixed(2)}`)
    if (values.price && toMoneyInt(values.price) !== existing.salePrice) changes.push(`Precio venta: ${moneyText(existing.salePrice)} → ${Number(values.price).toFixed(2)}`)
    if (values.min && toQtyInt(values.min) !== existing.minStock) changes.push(`Stock mínimo: ${formatQty(existing.minStock)} → ${formatQty(toQtyInt(values.min))}`)
    if (tax && tax !== existing.taxType) changes.push(`Impuesto: ${TAX_LABEL[existing.taxType] ?? existing.taxType} → ${TAX_LABEL[tax]}`)
    if (barcode && barcode !== (existing.barcodes[0]?.code ?? "")) changes.push(`Código de barras: ${existing.barcodes[0]?.code || "—"} → ${barcode}`)
    if (values.code && values.code !== existing.internalCode) {
      const taken = allProducts.find((p) => p.id !== existing.id && p.internalCode.toLowerCase() === values.code.toLowerCase())
      if (taken) {
        errors.push(`Fila ${line} (${name}): el código interno ${values.code} ya es de ${taken.name}`)
        return
      }
      changes.push(`Código interno: ${existing.internalCode} → ${values.code}`)
    }
    if (values.stock) errors.push(`Fila ${line} (${name}): el stock inicial solo vale para productos nuevos; el stock se ajusta en Almacenes → plantilla de stock`)
    if (changes.length) rows.push({ kind: "update", line, id: existing.id, name: existing.name, changes, values })
  })
  return { rows, errors, total: products.length }
}

/** Guarda lo nuevo y lo modificado. Cada producto se guarda por separado: si uno falla, se informa y siguen los demás. */
export async function applyProductSheet(ctx: TenantContext, file: Buffer) {
  const read = await readProductSheet(ctx, file)
  let created = 0
  let updated = 0
  const failed: string[] = []
  for (const row of read.rows) {
    const v = row.values
    try {
      if (row.kind === "update") {
        const { values: current } = await getProductForm(ctx, row.id!)
        const barcodes = [...current.barcodes]
        if (v.barcode && v.barcode !== barcodes[0]) {
          if (barcodes.length) barcodes[0] = v.barcode
          else barcodes.push(v.barcode)
        }
        await saveProduct(ctx, {
          ...current,
          name: v.name,
          internalCode: v.code || current.internalCode,
          categoryId: current.categoryId || undefined,
          brandName: v.brand || current.brandName,
          baseUnitId: v.unitId,
          costPrice: v.cost || current.costPrice,
          salePrice: v.price || current.salePrice,
          minStock: v.min || current.minStock,
          maxStock: current.maxStock || undefined,
          taxType: v.tax || current.taxType,
          barcodes: [...new Set(barcodes.filter(Boolean))],
        })
        updated++
      } else {
        await saveProduct(ctx, {
          name: v.name,
          internalCode: v.code || undefined,
          brandName: v.brand || undefined,
          baseUnitId: v.unitId,
          costPrice: v.cost || "0",
          salePrice: v.price || "0",
          wholesalePrice: "0",
          retailPrice: "0",
          minStock: v.min || "0",
          taxType: v.tax || "EXONERADO",
          initialQuantity: v.stock || undefined,
          trackLots: false,
          isActive: true,
          barcodes: v.barcode ? [v.barcode] : [],
          presentations: [],
        })
        created++
      }
    } catch (error) {
      failed.push(`Fila ${row.line} (${row.name}): ${error instanceof Error ? error.message : "no se pudo guardar"}`)
    }
  }
  return { created, updated, failed, errors: read.errors }
}
