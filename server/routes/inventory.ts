import type { Express } from "express"
import { loadCatalog } from "../../lib/catalog"
import { errorMessage } from "../../lib/errors"
import {
  cancelTransfer,
  listKardex,
  receiveTransfer,
  sendTransfer,
  setStock,
} from "../../lib/inventory"
import { MOVE_LABEL, TRANSFER_LABEL } from "../../lib/labels"
import { formatDate, formatQty } from "../../lib/money"
import { prisma } from "../../lib/db"
import { can } from "../../lib/roles"
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

  app.get("/api/inventory/transfers", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "transfer", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de transferencias" })
        return
      }
      const [products, warehouses, transfers] = await Promise.all([
        loadCatalog(ctx),
        prisma.warehouse.findMany({
          where: { businessId: ctx.businessId, isActive: true },
          orderBy: { name: "asc" },
        }),
        prisma.stockTransfer.findMany({
          where: { businessId: ctx.businessId },
          include: {
            fromWarehouse: true,
            toWarehouse: true,
            user: true,
            lines: { include: { product: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
        }),
      ])
      res.json({
        currentWarehouseId: ctx.warehouseId,
        products: products
          .filter((product) => product.isActive && !product.hasVariants)
          .map((product) => ({
            id: product.id,
            name: product.name,
            barcodes: product.barcodes.map((barcode) => barcode.code),
          })),
        warehouses: warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name })),
        transfers: transfers.map((transfer) => ({
          id: transfer.id,
          createdAtLabel: formatDate(transfer.createdAt),
          route: `${transfer.fromWarehouse.name} → ${transfer.toWarehouse.name}`,
          status: transfer.status,
          statusLabel: TRANSFER_LABEL[transfer.status] ?? transfer.status,
          userName: transfer.user.name,
          detail: transfer.lines.map((line) => `${line.product.name} ${formatQty(line.quantity)}`).join(", "),
          canReceive: transfer.status === "SENT",
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/inventory/transfers", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const lines = Array.isArray(req.body?.lines) ? req.body.lines : []
      const transfer = await sendTransfer(ctx, {
        fromWarehouseId: req.body?.fromWarehouseId ? String(req.body.fromWarehouseId) : undefined,
        toWarehouseId: String(req.body?.toWarehouseId ?? ""),
        notes: req.body?.notes ? String(req.body.notes) : undefined,
        lines: lines.map((line: { productId?: string; quantity?: string }) => ({
          productId: String(line.productId ?? ""),
          quantity: String(line.quantity ?? "0"),
        })),
      })
      res.json({ ok: true, id: transfer.id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/inventory/transfers/:id/receive", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await receiveTransfer(req.tenant!, String(req.params.id))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/inventory/transfers/:id/cancel", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await cancelTransfer(req.tenant!, String(req.params.id))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/inventory/adjustments", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "adjust", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de ajustes" })
        return
      }
      const products = (await loadCatalog(ctx)).filter((product) => product.isActive && !product.hasVariants)
      const lots = await prisma.lot.findMany({
        where: { businessId: ctx.businessId, warehouseId: ctx.warehouseId },
        orderBy: [{ expiresAt: "asc" }, { code: "asc" }],
        select: { productId: true, code: true, quantity: true, expiresAt: true },
      })
      res.json({
        warehouseName: ctx.warehouseName,
        products: products
          .map((product) => {
            const base =
              product.presentations.find((item) => item.factorToBase === "1") ??
              product.presentations.find((item) => item.isDefault) ??
              product.presentations[0]
            return {
              id: product.id,
              code: product.internalCode ?? "",
              name: product.name,
              brand: product.brandName ?? "—",
              category: product.categoryName ?? "Sin categoría",
              stock: product.stock,
              unit: product.baseUnit,
              min: product.minStock,
              presentationId: base?.id ?? "",
              trackLots: product.trackLots,
              lots: lots
                .filter((lot) => lot.productId === product.id)
                .map((lot) => ({
                  code: lot.code,
                  quantity: formatQty(lot.quantity),
                  expiresAt: lot.expiresAt ? lot.expiresAt.toLocaleDateString("es-PE") : "",
                })),
            }
          })
          .sort((a, b) => a.name.localeCompare(b.name, "es")),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/inventory/adjustments", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      await setStock(ctx, {
        productId: String(req.body?.productId ?? ""),
        presentationId: req.body?.presentationId ? String(req.body.presentationId) : undefined,
        quantity: String(req.body?.quantity ?? "0"),
        reason: String(req.body?.reason ?? "Conteo físico"),
        lotCode: req.body?.lotCode ? String(req.body.lotCode) : undefined,
        expiresAt: req.body?.expiresAt ? String(req.body.expiresAt) : undefined,
      })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
