/**
 * Toma de inventario (conteo físico).
 * 1. Se abre un conteo del almacén actual (todos los productos o una categoría).
 * 2. Se escribe lo contado; se guarda el avance tantas veces como haga falta.
 * 3. Al guardar el cuadre se compara contra el stock del sistema en ese momento,
 *    se ajusta el stock (kardex tipo ADJUST con referencia STOCK_COUNT) y queda el informe.
 */
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { applyStock, measureFactor } from "@/lib/inventory"
import { D, QTY_SCALE, mulScale, toQtyInt } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

export function countValue(unitCost: number, qty: number) {
  return D(unitCost).mul(qty).div(QTY_SCALE).toDecimalPlaces(0).toNumber()
}

async function openCountOf(ctx: TenantContext, countId: string) {
  const count = await prisma.stockCount.findFirst({ where: { id: countId, businessId: ctx.businessId } })
  if (!count) throw new AppError("Conteo no encontrado")
  if (count.status !== "OPEN") throw new AppError("Este conteo ya está cerrado")
  if (count.warehouseId !== ctx.warehouseId) throw new AppError("Este conteo es de otro almacén. Cambia de lugar de trabajo para continuarlo")
  return count
}

/** Tipos de inventario: cada uno funciona por separado y tiene su propio informe. */
export const COUNT_MODES = {
  BLIND: "Inventario ciego",
  CORRECTION: "Corrección de stock",
  DIFFERENCES: "Faltas y sobras",
} as const
export type CountMode = keyof typeof COUNT_MODES
export function isCountMode(value: unknown): value is CountMode {
  return typeof value === "string" && value in COUNT_MODES
}

export async function createCount(ctx: TenantContext, input: { categoryId?: string; brandId?: string; note?: string; mode?: string }) {
  assertCan(ctx, "adjust")
  const open = await prisma.stockCount.findFirst({ where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId, status: "OPEN" } })
  if (open) throw new AppError(`Ya hay un conteo abierto (N.º ${open.number}) en este almacén. Continúalo o anúlalo`)
  let scope = "Todos los productos"
  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, businessId: ctx.businessId } })
    if (!category) throw new AppError("Categoría no encontrada")
    scope = `Categoría ${category.name}`
  }
  if (input.brandId) {
    const brand = await prisma.brand.findFirst({ where: { id: input.brandId, businessId: ctx.businessId } })
    if (!brand) throw new AppError("Marca no encontrada")
    scope = `Marca ${brand.name}`
  }
  const products = await prisma.product.findMany({
    where: {
      businessId: ctx.businessId,
      isActive: true,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.brandId ? { brandId: input.brandId } : {}),
    },
    select: { id: true },
  })
  if (products.length === 0) throw new AppError("No hay productos activos para contar")
  return prisma.$transaction(async (tx) => {
    const last = await tx.stockCount.findFirst({ where: { businessId: ctx.businessId }, orderBy: { number: "desc" }, select: { number: true } })
    return tx.stockCount.create({
      data: {
        businessId: ctx.businessId,
        warehouseId: ctx.warehouseId,
        userId: ctx.userId,
        number: (last?.number ?? 0) + 1,
        mode: isCountMode(input.mode) ? input.mode : "CORRECTION",
        scope,
        note: input.note?.trim() || null,
        lines: { create: products.map((product) => ({ productId: product.id })) },
      },
    })
  })
}

/** Guarda el avance. quantity vacío = sin contar. Cada cantidad viene en la unidad elegida (kg, g, saco…). */
export async function saveCountLines(
  ctx: TenantContext,
  countId: string,
  lines: { productId: string; quantity: string; measureId?: string }[],
) {
  assertCan(ctx, "adjust")
  await openCountOf(ctx, countId)
  if (lines.length > 5000) throw new AppError("Demasiadas líneas en un solo guardado")
  const updates: { productId: string; countedQty: number | null }[] = []
  for (const line of lines) {
    const raw = String(line.quantity ?? "").trim().replace(",", ".")
    if (!raw) {
      updates.push({ productId: line.productId, countedQty: null })
      continue
    }
    const { factor } = await measureFactor(ctx, line.productId, line.measureId)
    updates.push({ productId: line.productId, countedQty: mulScale(toQtyInt(raw), factor) })
  }
  await prisma.$transaction(
    updates.map((item) =>
      prisma.stockCountLine.updateMany({ where: { countId, productId: item.productId }, data: { countedQty: item.countedQty } }),
    ),
  )
  await prisma.stockCount.update({ where: { id: countId }, data: { updatedAt: new Date() } })
  return { saved: updates.length }
}

export async function getCount(ctx: TenantContext, countId: string) {
  const count = await prisma.stockCount.findFirst({
    where: { id: countId, businessId: ctx.businessId },
    include: {
      warehouse: { select: { name: true } },
      user: { select: { name: true } },
      lines: {
        include: {
          product: {
            include: {
              baseUnit: { select: { symbol: true } },
              category: { select: { name: true } },
              brand: { select: { name: true } },
              barcodes: { select: { code: true } },
              presentations: { where: { isActive: true }, select: { id: true, name: true, factorToBase: true, isActive: true } },
            },
          },
        },
      },
    },
  })
  if (!count) throw new AppError("Conteo no encontrado")
  // Mientras está abierto, el "sistema" es el stock actual del almacén.
  const balances =
    count.status === "OPEN"
      ? await prisma.stockBalance.findMany({
          where: { businessId: ctx.businessId, warehouseId: count.warehouseId, productId: { in: count.lines.map((line) => line.productId) } },
          select: { productId: true, quantity: true },
        })
      : []
  const stock = new Map(balances.map((item) => [item.productId, item.quantity]))
  const lines = count.lines
    .map((line) => {
      const systemQty = count.status === "OPEN" ? (stock.get(line.productId) ?? 0) : line.systemQty
      const unitCost = count.status === "OPEN" ? line.product.costPrice : line.unitCost
      return { ...line, systemQty, unitCost }
    })
    .sort((a, b) => a.product.name.localeCompare(b.product.name, "es"))
  return { ...count, lines }
}

export async function closeCount(ctx: TenantContext, countId: string, input: { uncounted: "KEEP" | "ZERO" }) {
  assertCan(ctx, "adjust")
  const count = await openCountOf(ctx, countId)
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  return prisma.$transaction(
    async (tx) => {
      const lines = await tx.stockCountLine.findMany({ where: { countId }, include: { product: true } })
      const balances = await tx.stockBalance.findMany({
        where: { businessId: ctx.businessId, warehouseId: count.warehouseId, productId: { in: lines.map((line) => line.productId) } },
      })
      const stock = new Map(balances.map((item) => [item.productId, item.quantity]))
      let countedItems = 0
      let diffItems = 0
      let shortageValue = 0
      let surplusValue = 0
      let systemValue = 0
      let countedValue = 0
      for (const line of lines) {
        const systemQty = stock.get(line.productId) ?? 0
        const counted = line.countedQty ?? (input.uncounted === "ZERO" ? 0 : null)
        const unitCost = line.product.costPrice
        if (counted === null) {
          await tx.stockCountLine.update({ where: { id: line.id }, data: { systemQty, unitCost, diffQty: 0, diffValue: 0 } })
          continue
        }
        countedItems += 1
        const diffQty = counted - systemQty
        const diffValue = countValue(unitCost, diffQty)
        systemValue += countValue(unitCost, systemQty)
        countedValue += countValue(unitCost, counted)
        await tx.stockCountLine.update({ where: { id: line.id }, data: { countedQty: counted, systemQty, unitCost, diffQty, diffValue } })
        if (diffQty === 0) continue
        diffItems += 1
        if (diffQty < 0) shortageValue += -diffValue
        else surplusValue += diffValue
        // Ciego y Faltas y sobras solo informan: no tocan el stock.
        if (count.mode !== "CORRECTION") continue
        let surplusLot: string | undefined
        if (diffQty > 0 && line.product.trackLots) {
          const lots = await tx.lot.findMany({ where: { warehouseId: count.warehouseId, productId: line.productId }, select: { code: true } })
          surplusLot = lots.length === 1 ? lots[0].code : `INV${day}-${count.number}`
        }
        await applyStock(tx, {
          businessId: ctx.businessId,
          warehouseId: count.warehouseId,
          productId: line.productId,
          userId: ctx.userId,
          direction: diffQty > 0 ? "IN" : "OUT",
          type: "ADJUST",
          quantity: Math.abs(diffQty),
          reason: `Conteo N.º ${count.number}: ${diffQty > 0 ? "sobrante" : "faltante"}`,
          referenceType: "STOCK_COUNT",
          referenceId: count.id,
          // Un sobrante de un producto con lotes entra a un lote de conteo; un faltante sale por vencimiento.
          lotCode: surplusLot,
        })
      }
      if (countedItems === 0) throw new AppError("No contaste ningún producto. Escribe al menos una cantidad")
      await tx.auditLog.create({
        data: {
          businessId: ctx.businessId,
          userId: ctx.userId,
          action: "stock_count.close",
          entity: "StockCount",
          entityId: count.id,
          detail: `${COUNT_MODES[count.mode as CountMode] ?? "Conteo"} N.º ${count.number}: ${countedItems} contados, ${diffItems} con diferencia`,
        },
      })
      return tx.stockCount.update({
        where: { id: count.id },
        data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId, countedItems, diffItems, shortageValue, surplusValue, systemValue, countedValue },
      })
    },
    { timeout: 60_000 },
  )
}

export async function cancelCount(ctx: TenantContext, countId: string) {
  assertCan(ctx, "adjust")
  await openCountOf(ctx, countId)
  return prisma.stockCount.update({ where: { id: countId }, data: { status: "CANCELLED", closedAt: new Date(), closedById: ctx.userId } })
}

export async function listCounts(ctx: TenantContext, range?: { from: Date; to: Date }) {
  return prisma.stockCount.findMany({
    where: { businessId: ctx.businessId, ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}) },
    include: { warehouse: { select: { name: true } }, user: { select: { name: true } }, _count: { select: { lines: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
}
