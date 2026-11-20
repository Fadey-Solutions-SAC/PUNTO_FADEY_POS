import type { Express } from "express"
import { prisma } from "../../lib/db"
import { AppError, errorMessage } from "../../lib/errors"
import { stockIn } from "../../lib/inventory"
import { MOVE_LABEL } from "../../lib/labels"
import { formatDate, formatQty } from "../../lib/money"
import { parseRange } from "../../lib/reports"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

/** Causas de una entrada sin compra. "Devolución de cliente" se registra como RETURN; el resto como ENTRY. */
const ENTRY_CAUSES = ["Saldo inicial", "Producción propia", "Donación o regalo", "Devolución de cliente", "Sobrante de inventario", "Otro"]

export function registerEntriesRoutes(app: Express) {
  app.get("/api/inventory/entries", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "inventoryMove", ctx.grants) && !can(ctx.role, "reports", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de inventario" })
        return
      }
      const range = parseRange(
        req.query.desde ? String(req.query.desde) : undefined,
        req.query.hasta ? String(req.query.hasta) : undefined,
      )
      const rows = await prisma.stockMovement.findMany({
        where: {
          businessId: ctx.businessId,
          warehouseId: ctx.warehouseId,
          direction: "IN",
          type: { in: ["ENTRY", "RETURN"] },
          referenceType: "STOCK_ENTRY",
          createdAt: { gte: range.from, lte: range.to },
        },
        include: { product: { select: { name: true, baseUnit: { select: { symbol: true } } } }, user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 300,
      })
      const byCause = new Map<string, number>()
      for (const row of rows) {
        const cause = (row.reason ?? "").split(" · ")[0] || "Otro"
        byCause.set(cause, (byCause.get(cause) ?? 0) + 1)
      }
      res.json({
        warehouseName: ctx.warehouseName,
        canRegister: can(ctx.role, "inventoryMove", ctx.grants),
        causes: ENTRY_CAUSES,
        count: rows.length,
        byCause: [...byCause.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })),
        rows: rows.map((row) => ({
          id: row.id,
          createdAtLabel: formatDate(row.createdAt),
          productName: row.product.name,
          typeLabel: MOVE_LABEL[row.type] ?? row.type,
          reason: row.reason ?? "",
          quantityLabel: `${formatQty(row.quantity)} ${row.product.baseUnit.symbol}`,
          balanceLabel: `${formatQty(row.balanceAfter)} ${row.product.baseUnit.symbol}`,
          lotCode: row.lotCode ?? "",
          userName: row.user.name,
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/inventory/entries", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const cause = String(req.body?.cause ?? "").trim()
      if (!ENTRY_CAUSES.includes(cause)) throw new AppError("Elige la causa de la entrada")
      const note = String(req.body?.note ?? "").trim()
      if (cause === "Otro" && !note) throw new AppError("Describe el motivo en la nota")
      const reason = note ? `${cause} · ${note}` : cause
      const balance = await stockIn(ctx, {
        productId: String(req.body?.productId ?? ""),
        presentationId: req.body?.presentationId ? String(req.body.presentationId) : undefined,
        quantity: String(req.body?.quantity ?? ""),
        type: cause === "Devolución de cliente" ? "RETURN" : "ENTRY",
        reason,
        lotCode: req.body?.lotCode ? String(req.body.lotCode) : undefined,
        expiresAt: req.body?.expiresAt ? `${String(req.body.expiresAt)}T00:00:00` : undefined,
        referenceType: "STOCK_ENTRY",
      })
      await prisma.auditLog.create({
        data: { businessId: ctx.businessId, userId: ctx.userId, action: "stock_entry.create", entity: "Product", entityId: String(req.body?.productId ?? ""), detail: `${req.body?.quantity} · ${reason}` },
      })
      res.json({ ok: true, balanceLabel: formatQty(balance.quantity) })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
