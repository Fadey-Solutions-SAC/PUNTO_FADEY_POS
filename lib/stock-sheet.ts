import ExcelJS from "exceljs"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { setStock } from "@/lib/inventory"
import { formatMoney, formatQty, toQtyInt } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

/**
 * Plantilla Excel de stock (Almacenes): se descarga con los productos tal como se ven en Almacenes,
 * el usuario cambia las cantidades de las columnas "Stock <almacén>" y la vuelve a subir.
 * Al subir se compara con el stock actual y solo se ajusta lo que cambió (movimiento ADJUST en el kardex).
 */

const STOCK_PREFIX = "Stock "
const ID_HEADER = "ID (no modificar)"
export const STOCK_SHEET_REASON = "Ajuste por plantilla de stock"

async function sheetData(ctx: TenantContext) {
  const warehouses = await prisma.warehouse.findMany({
    where: { businessId: ctx.businessId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true },
  })
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, isActive: true, variants: { none: { isActive: true } } },
    include: { brand: true, baseUnit: true, balances: { select: { warehouseId: true, quantity: true } } },
    orderBy: { name: "asc" },
  })
  return { warehouses, products }
}

export async function buildStockSheet(ctx: TenantContext) {
  assertCan(ctx, "adjust")
  const { warehouses, products } = await sheetData(ctx)
  const book = new ExcelJS.Workbook()
  book.creator = "Punto Fadey"
  const sheet = book.addWorksheet("Stock", { views: [{ state: "frozen", ySplit: 1 }] })

  const fixed = [
    { header: "Código", width: 14 },
    { header: "Producto", width: 42 },
    { header: "Marca", width: 18 },
    { header: "Unidad", width: 9 },
    { header: "Precio venta", width: 13 },
    { header: "P. compra", width: 12 },
  ]
  const stockCols = warehouses.map((warehouse) => ({ header: `${STOCK_PREFIX}${warehouse.name}`, width: Math.max(14, warehouse.name.length + 8) }))
  const columns = [...fixed, ...stockCols, { header: "Stock total", width: 12 }, { header: ID_HEADER, width: 28 }]
  sheet.columns = columns.map((column) => ({ header: column.header, width: column.width }))

  const firstStock = fixed.length + 1
  const lastStock = fixed.length + stockCols.length
  for (const product of products) {
    const byWarehouse = new Map(product.balances.map((item) => [item.warehouseId, item.quantity]))
    const row = sheet.addRow([
      product.internalCode ?? "",
      product.name,
      product.brand?.name ?? "",
      product.baseUnit.symbol,
      formatMoney(product.salePrice, ctx.currency),
      formatMoney(product.costPrice, ctx.currency),
      ...warehouses.map((warehouse) => Number(formatQty(byWarehouse.get(warehouse.id) ?? 0))),
      null,
      product.id,
    ])
    const totalCell = row.getCell(lastStock + 1)
    if (stockCols.length) {
      const from = sheet.getColumn(firstStock).letter
      const to = sheet.getColumn(lastStock).letter
      totalCell.value = { formula: `SUM(${from}${row.number}:${to}${row.number})` }
    }
  }

  // Cuadro con líneas: encabezado oscuro, columnas de stock en amarillo (las que se editan), resto en gris claro.
  const border = { style: "thin" as const, color: { argb: "FF94A3B8" } }
  sheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = { top: border, left: border, bottom: border, right: border }
      if (rowNumber === 1) {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colNumber >= firstStock && colNumber <= lastStock ? "FF0D9488" : "FF1E293B" } }
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
        return
      }
      if (colNumber >= firstStock && colNumber <= lastStock) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } }
        cell.font = { bold: true }
        cell.numFmt = "0.####"
      } else if (colNumber === lastStock + 1) {
        cell.numFmt = "0.####"
        cell.font = { bold: true }
      } else if (colNumber === columns.length) {
        cell.font = { color: { argb: "FF94A3B8" }, size: 8 }
      }
      if (colNumber >= 5 && colNumber !== 2 && colNumber !== 3) cell.alignment = { horizontal: colNumber === columns.length ? "left" : "right" }
    })
  })
  sheet.getRow(1).height = 30
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  return Buffer.from(await book.xlsx.writeBuffer())
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ""
  if (typeof value === "object") {
    if ("result" in value) return cellText((value as { result?: ExcelJS.CellValue }).result ?? null)
    if ("richText" in value) return (value as ExcelJS.CellRichTextValue).richText.map((part) => part.text).join("")
    if ("text" in value) return String((value as { text: unknown }).text ?? "")
    if (value instanceof Date) return value.toISOString()
    return ""
  }
  return String(value).trim()
}

export type StockSheetChange = {
  productId: string
  product: string
  unit: string
  warehouseId: string
  warehouse: string
  current: string
  next: string
  diff: string
}

/** Lee la plantilla subida y devuelve los cambios respecto al stock actual (sin guardar nada). */
export async function readStockSheet(ctx: TenantContext, file: Buffer) {
  assertCan(ctx, "adjust")
  const book = new ExcelJS.Workbook()
  try {
    await book.xlsx.load(file as unknown as ArrayBuffer)
  } catch {
    throw new AppError("No se pudo leer el archivo. Sube la plantilla en formato Excel (.xlsx).")
  }
  const sheet = book.worksheets[0]
  if (!sheet) throw new AppError("El archivo no tiene hojas")
  const { warehouses, products } = await sheetData(ctx)
  const byId = new Map(products.map((product) => [product.id, product]))
  const byName = new Map(products.map((product) => [product.name.trim().toUpperCase(), product]))
  const warehouseByName = new Map(warehouses.map((warehouse) => [warehouse.name.trim().toUpperCase(), warehouse]))

  const header = sheet.getRow(1)
  let idCol = 0
  let nameCol = 0
  const stockCols: { col: number; warehouse: (typeof warehouses)[number] }[] = []
  const unknownWarehouses: string[] = []
  header.eachCell((cell, col) => {
    const text = cellText(cell.value)
    const upper = text.toUpperCase()
    if (upper.startsWith("ID")) idCol = col
    else if (upper === "PRODUCTO") nameCol = col
    else if (upper.startsWith(STOCK_PREFIX.toUpperCase()) && upper !== "STOCK TOTAL") {
      const warehouse = warehouseByName.get(text.slice(STOCK_PREFIX.length).trim().toUpperCase())
      if (warehouse) stockCols.push({ col, warehouse })
      else unknownWarehouses.push(text)
    }
  })
  if (!stockCols.length) throw new AppError("No encontré columnas de stock. Usa la plantilla descargada desde Almacenes.")
  if (!idCol && !nameCol) throw new AppError("No encontré la columna Producto ni la columna ID")

  const changes: StockSheetChange[] = []
  const errors: string[] = unknownWarehouses.map((name) => `Columna "${name}": ese almacén no existe, se ignoró`)
  let rows = 0
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const id = idCol ? cellText(row.getCell(idCol).value) : ""
    const name = nameCol ? cellText(row.getCell(nameCol).value) : ""
    if (!id && !name) return
    rows++
    const product = byId.get(id) ?? byName.get(name.toUpperCase())
    if (!product) {
      errors.push(`Fila ${rowNumber}: no encontré el producto "${name || id}"`)
      return
    }
    const balances = new Map(product.balances.map((item) => [item.warehouseId, item.quantity]))
    for (const { col, warehouse } of stockCols) {
      const raw = cellText(row.getCell(col).value).replace(/\s/g, "").replace(",", ".")
      if (raw === "") continue
      if (raw.startsWith("-")) {
        errors.push(`Fila ${rowNumber} (${product.name}): la cantidad en ${warehouse.name} no puede ser negativa`)
        continue
      }
      let next: number
      try {
        next = toQtyInt(raw)
      } catch {
        errors.push(`Fila ${rowNumber} (${product.name}): "${raw}" no es una cantidad válida en ${warehouse.name}`)
        continue
      }
      if (!Number.isFinite(next) || next < 0) {
        errors.push(`Fila ${rowNumber} (${product.name}): la cantidad en ${warehouse.name} no puede ser negativa`)
        continue
      }
      const current = balances.get(warehouse.id) ?? 0
      if (next === current) continue
      const diff = next - current
      changes.push({
        productId: product.id,
        product: product.name,
        unit: product.baseUnit.symbol,
        warehouseId: warehouse.id,
        warehouse: warehouse.name,
        current: formatQty(current),
        next: formatQty(next),
        diff: `${diff > 0 ? "+" : "-"}${formatQty(Math.abs(diff))}`,
      })
    }
  })
  return { rows, changes, errors }
}

/** Aplica los cambios de la plantilla: un ajuste por producto y almacén. Los que fallan se informan y no detienen al resto. */
export async function applyStockSheet(ctx: TenantContext, file: Buffer) {
  const read = await readStockSheet(ctx, file)
  const warehouseNames = new Map(read.changes.map((change) => [change.warehouseId, change.warehouse]))
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, id: { in: [...new Set(read.changes.map((change) => change.productId))] } },
    select: { id: true, baseUnitId: true },
  })
  const baseUnit = new Map(products.map((product) => [product.id, product.baseUnitId]))
  let applied = 0
  const failed: string[] = []
  for (const change of read.changes) {
    try {
      await setStock(
        { ...ctx, warehouseId: change.warehouseId, warehouseName: warehouseNames.get(change.warehouseId) ?? ctx.warehouseName },
        { productId: change.productId, presentationId: `unit:${baseUnit.get(change.productId)}`, quantity: change.next, reason: STOCK_SHEET_REASON },
      )
      applied++
    } catch (error) {
      failed.push(`${change.product} (${change.warehouse}): ${error instanceof Error ? error.message : "no se pudo ajustar"}`)
    }
  }
  return { applied, failed, errors: read.errors }
}
