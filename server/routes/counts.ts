import type { Express } from "express"
import { COUNT_MODES, type CountMode, cancelCount, closeCount, countValue, createCount, getCount, listCounts, saveCountLines } from "../../lib/counts"
import { prisma } from "../../lib/db"
import { errorMessage } from "../../lib/errors"
import { measureOptions, unitConversionsTo } from "../../lib/inventory"
import { formatDate, formatMoney, formatQty } from "../../lib/money"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

const STATUS_LABEL: Record<string, string> = { OPEN: "En conteo", CLOSED: "Cuadrado", CANCELLED: "Anulado" }

export function registerCountRoutes(app: Express) {
  app.get("/api/inventory/counts", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "adjust", ctx.grants) && !can(ctx.role, "reports", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de inventario" })
        return
      }
      const [counts, categories, brands] = await Promise.all([
        listCounts(ctx),
        prisma.category.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.brand.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ])
      const money = (cents: number) => formatMoney(cents, ctx.currency)
      res.json({
        warehouseName: ctx.warehouseName,
        canManage: can(ctx.role, "adjust", ctx.grants),
        categories,
        brands,
        openId: counts.find((row) => row.status === "OPEN" && row.warehouseId === ctx.warehouseId)?.id ?? null,
        counts: counts.map((row) => ({
          id: row.id,
          number: row.number,
          mode: row.mode,
          modeLabel: COUNT_MODES[row.mode as CountMode] ?? row.mode,
          status: row.status,
          statusLabel: STATUS_LABEL[row.status] ?? row.status,
          warehouseName: row.warehouse.name,
          scope: row.scope,
          userName: row.user.name,
          createdAtLabel: formatDate(row.createdAt),
          closedAtLabel: row.closedAt ? formatDate(row.closedAt) : "",
          products: row._count.lines,
          countedItems: row.countedItems,
          diffItems: row.diffItems,
          shortage: money(row.shortageValue),
          surplus: money(row.surplusValue),
          net: money(row.surplusValue - row.shortageValue),
          netCents: row.surplusValue - row.shortageValue,
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/inventory/counts", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const count = await createCount(req.tenant!, {
        categoryId: req.body?.categoryId ? String(req.body.categoryId) : undefined,
        brandId: req.body?.brandId ? String(req.body.brandId) : undefined,
        mode: req.body?.mode ? String(req.body.mode) : undefined,
        note: req.body?.note ? String(req.body.note) : undefined,
      })
      res.json({ ok: true, id: count.id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/inventory/counts/:id", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "adjust", ctx.grants) && !can(ctx.role, "reports", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de inventario" })
        return
      }
      const count = await getCount(ctx, String(req.params.id))
      const conversions = await unitConversionsTo(ctx.businessId)
      const money = (cents: number) => formatMoney(cents, ctx.currency)
      res.json({
        id: count.id,
        number: count.number,
        mode: count.mode,
        modeLabel: COUNT_MODES[count.mode as CountMode] ?? count.mode,
        status: count.status,
        statusLabel: STATUS_LABEL[count.status] ?? count.status,
        warehouseName: count.warehouse.name,
        sameWarehouse: count.warehouseId === ctx.warehouseId,
        scope: count.scope,
        note: count.note ?? "",
        userName: count.user.name,
        createdAtLabel: formatDate(count.createdAt),
        closedAtLabel: count.closedAt ? formatDate(count.closedAt) : "",
        canManage: can(ctx.role, "adjust", ctx.grants),
        currency: ctx.currency,
        summary: {
          countedItems: count.countedItems,
          diffItems: count.diffItems,
          shortage: money(count.shortageValue),
          surplus: money(count.surplusValue),
          net: money(count.surplusValue - count.shortageValue),
          systemValue: money(count.systemValue),
          countedValue: money(count.countedValue),
        },
        lines: count.lines.map((line) => ({
          productId: line.productId,
          name: line.product.name,
          code: line.product.internalCode,
          category: line.product.brand?.name ?? "Sin marca",
          unit: line.product.baseUnit.symbol,
          barcodes: line.product.barcodes.map((item) => item.code),
          trackLots: line.product.trackLots,
          measures: measureOptions(line.product, conversions),
          // Cantidades en unidad base, como número.
          system: line.systemQty / 10_000,
          counted: line.countedQty === null ? null : line.countedQty / 10_000,
          costPerUnit: line.unitCost / 100,
          diffLabel: count.status === "CLOSED" ? formatQty(line.diffQty) : "",
          diffValue: count.status === "CLOSED" ? money(line.diffValue) : "",
          diffValueCents: count.status === "CLOSED" ? line.diffValue : countValue(line.unitCost, (line.countedQty ?? line.systemQty) - line.systemQty),
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.put("/api/inventory/counts/:id/lines", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const raw = Array.isArray(req.body?.lines) ? req.body.lines : []
      const result = await saveCountLines(
        req.tenant!,
        String(req.params.id),
        raw.map((line: Record<string, unknown>) => ({
          productId: String(line.productId ?? ""),
          quantity: line.quantity == null ? "" : String(line.quantity),
          measureId: line.measureId ? String(line.measureId) : undefined,
        })),
      )
      res.json({ ok: true, ...result })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/inventory/counts/:id/close", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const count = await closeCount(req.tenant!, String(req.params.id), { uncounted: req.body?.uncounted === "ZERO" ? "ZERO" : "KEEP" })
      res.json({ ok: true, id: count.id, diffItems: count.diffItems })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/inventory/counts/:id/cancel", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await cancelCount(req.tenant!, String(req.params.id))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Hoja del cuadre en CSV (Excel), con BOM para que respete tildes.
  app.get("/api/inventory/counts/:id/csv", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const count = await getCount(ctx, String(req.params.id))
      const cell = (value: string | number) => {
        const text = String(value)
        return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
      }
      const rows = [["Código", "Producto", "Marca", "Unidad", "Sistema", "Contado", "Diferencia", "Costo unit.", "Valor diferencia"]]
      for (const line of count.lines) {
        const counted = line.countedQty
        const diff = count.status === "CLOSED" ? line.diffQty : counted === null ? 0 : counted - line.systemQty
        rows.push([
          line.product.internalCode,
          line.product.name,
          line.product.brand?.name ?? "",
          line.product.baseUnit.symbol,
          formatQty(line.systemQty),
          counted === null ? "" : formatQty(counted),
          counted === null ? "" : formatQty(diff),
          (line.unitCost / 100).toFixed(2),
          counted === null ? "" : (countValue(line.unitCost, diff) / 100).toFixed(2),
        ])
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="conteo-${count.number}.csv"`)
      res.send("﻿" + rows.map((row) => row.map(cell).join(";")).join("\r\n"))
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
