import type { Express } from "express"
import { loadCatalog } from "../../lib/catalog"
import { errorMessage } from "../../lib/errors"
import { listKardex } from "../../lib/inventory"
import { MOVE_LABEL } from "../../lib/labels"
import { formatDate, formatQty } from "../../lib/money"
import { prisma } from "../../lib/db"
import { requireApiTenant, type AuthedRequest } from "../tenant"

const DAY = 24 * 60 * 60 * 1000

function startOfDay(date: Date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function expiryLabel(expiresAt: Date) {
  const days = Math.round((startOfDay(expiresAt).getTime() - startOfDay(new Date()).getTime()) / DAY)
  if (days < 0) return days === -1 ? "Vencido hace 1 día" : `Vencido hace ${-days} días`
  if (days === 0) return "Vence hoy"
  if (days === 1) return "Vence mañana"
  return `Vence en ${days} días`
}

export function registerInventoryRoutes(app: Express) {
  app.get("/api/inventory/alerts", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const horizon = startOfDay(new Date())
      horizon.setDate(horizon.getDate() + 15)
      horizon.setHours(23, 59, 59, 999)
      const [catalog, lots] = await Promise.all([
        loadCatalog(ctx),
        prisma.lot.findMany({
          where: {
            businessId: ctx.businessId,
            warehouseId: ctx.warehouseId,
            quantity: { gt: 0 },
            expiresAt: { lte: horizon },
          },
          include: { product: { select: { name: true, baseUnit: { select: { symbol: true } } } } },
          orderBy: { expiresAt: "asc" },
        }),
      ])
      const stockAlerts = catalog
        .filter((product) => product.isActive && !product.hasVariants)
        .filter((product) => {
          const quantity = Number(product.stock)
          const min = Number(product.minStock)
          return quantity <= 0 || (min > 0 && quantity <= min)
        })
        .map((product) => ({
          id: product.id,
          name: product.name,
          stock: `${product.stock} ${product.baseUnit}`,
          minStock: product.minStock,
          state: Number(product.stock) <= 0 ? "Agotado" : "Bajo",
        }))
      res.json({
        warehouseName: ctx.warehouseName,
        stockAlerts,
        lots: lots.map((lot) => ({
          id: lot.id,
          productName: lot.product.name,
          code: lot.code,
          quantity: `${formatQty(lot.quantity)} ${lot.product.baseUnit.symbol}`,
          expiresAtLabel: lot.expiresAt ? formatDate(lot.expiresAt) : "—",
          notice: lot.expiresAt ? expiryLabel(lot.expiresAt) : "—",
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/inventory/warehouses", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const warehouses = await prisma.warehouse.findMany({
        where: { businessId: ctx.businessId },
        include: {
          branch: true,
          balances: {
            include: { product: { include: { category: true, brand: true, baseUnit: true } } },
          },
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      })
      res.json({
        currentWarehouseId: ctx.warehouseId,
        warehouses: warehouses.map((warehouse) => {
          const rows = [...warehouse.balances]
            .sort((a, b) => a.product.name.localeCompare(b.product.name, "es"))
            .map((balance) => {
              const quantity = Number(formatQty(balance.quantity))
              const min = Number(formatQty(balance.product.minStock))
              return {
                id: balance.id,
                code: balance.product.internalCode,
                name: balance.product.name,
                category: balance.product.category?.name ?? "Sin categoría",
                brand: balance.product.brand?.name ?? "—",
                stock: `${formatQty(balance.quantity)} ${balance.product.baseUnit.symbol}`,
                state: quantity <= 0 ? "Agotado" : min > 0 && quantity <= min ? "Bajo" : "Disponible",
              }
            })
          return {
            id: warehouse.id,
            name: warehouse.name,
            branch: warehouse.branch.name,
            isDefault: warehouse.isDefault,
            inUse: warehouse.id === ctx.warehouseId,
            rows,
          }
        }),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/inventory/kardex", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const productId = String(req.query.producto ?? "") || undefined
      const movements = await listKardex(ctx, productId)
      res.json({
        movements: movements.map((movement) => ({
          id: movement.id,
          createdAtLabel: formatDate(movement.createdAt),
          warehouseName: movement.warehouse.name,
          productName: movement.product.name,
          typeLabel: MOVE_LABEL[movement.type] ?? movement.type,
          quantityLabel: `${movement.direction === "OUT" ? "-" : "+"}${formatQty(movement.quantity)}`,
          balanceLabel: formatQty(movement.balanceAfter),
          userName: movement.user.name,
          reason: movement.reason ?? "—",
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
