import type { Express } from "express"
import { errorMessage } from "../../lib/errors"
import { LOSS_CAUSES, LOSS_TYPES, listLosses, lossFormData, registerLoss, voidLoss } from "../../lib/losses"
import { formatDate, formatMoney, formatQty, fromMoneyInt } from "../../lib/money"
import { parseRange } from "../../lib/reports"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

export function registerLossesRoutes(app: Express) {
  // Registros y resumen del período.
  app.get("/api/inventory/losses", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const range = parseRange(
        req.query.desde ? String(req.query.desde) : undefined,
        req.query.hasta ? String(req.query.hasta) : undefined,
      )
      const data = await listLosses(ctx, range, { type: req.query.tipo ? String(req.query.tipo) : undefined })
      const money = (cents: number) => formatMoney(cents, ctx.currency)
      res.json({
        currency: ctx.currency,
        warehouseName: ctx.warehouseName,
        canRegister: can(ctx.role, "inventoryMove", ctx.grants),
        canVoid: can(ctx.role, "adjust", ctx.grants),
        types: Object.entries(LOSS_TYPES).map(([code, label]) => ({ code, label, causes: LOSS_CAUSES[code as keyof typeof LOSS_CAUSES] })),
        summary: {
          total: money(data.totalCost),
          totalCents: data.totalCost,
          count: data.count,
          voided: data.voided,
          byType: data.byType.map(([code, item]) => ({
            code,
            label: LOSS_TYPES[code as keyof typeof LOSS_TYPES] ?? code,
            cost: money(item.cost),
            costCents: item.cost,
            count: item.count,
          })),
          byCause: data.byCause.map(([label, item]) => ({ label, cost: money(item.cost), costCents: item.cost, count: item.count })),
          byProduct: data.byProduct.slice(0, 10).map(([label, item]) => ({ label, cost: money(item.cost), costCents: item.cost, count: item.count })),
        },
        rows: data.rows.map((row) => ({
          id: row.id,
          createdAtLabel: formatDate(row.createdAt),
          type: row.type,
          typeLabel: LOSS_TYPES[row.type as keyof typeof LOSS_TYPES] ?? row.type,
          cause: row.cause,
          productName: row.product.name,
          productCode: row.product.internalCode,
          category: row.product.brand?.name ?? "",
          quantityLabel: `${row.presentationQty ?? formatQty(row.quantity)} ${row.presentationName ?? row.product.baseUnit.symbol}`,
          baseQuantityLabel: `${formatQty(row.quantity)} ${row.product.baseUnit.symbol}`,
          unitCost: money(row.unitCost),
          totalCost: money(row.totalCost),
          totalCostCents: row.totalCost,
          lotCode: row.lotCode ?? "",
          note: row.note ?? "",
          userName: row.user.name,
          warehouseName: row.warehouse.name,
          status: row.status,
          voidReason: row.voidReason ?? "",
          voidedAtLabel: row.voidedAt ? formatDate(row.voidedAt) : "",
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Productos del almacén actual para registrar una merma.
  app.get("/api/inventory/losses/form", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const products = await lossFormData(ctx)
      res.json({
        warehouseName: ctx.warehouseName,
        products: products.map((product) => ({
          id: product.id,
          name: product.name,
          code: product.internalCode,
          unit: product.baseUnit.symbol,
          stock: (product.balances[0]?.quantity ?? 0) / 10_000,
          stockLabel: formatQty(product.balances[0]?.quantity ?? 0),
          // Costo por unidad base, para calcular el valor de la merma antes de guardar.
          costPerBase: fromMoneyInt(product.costPrice).toNumber(),
          trackLots: product.trackLots,
          barcodes: product.barcodes.map((item) => item.code),
          imagePath: product.imagePath ?? null,
          categoryId: product.categoryId,
          brandId: product.brandId,
          presentations: product.measures,
          lots: product.lots.map((lot) => ({
            code: lot.code,
            quantityLabel: formatQty(lot.quantity),
            expiresAtLabel: lot.expiresAt ? lot.expiresAt.toLocaleDateString("es-PE") : "",
          })),
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/inventory/losses", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const loss = await registerLoss(req.tenant!, {
        productId: String(req.body?.productId ?? ""),
        presentationId: req.body?.presentationId ? String(req.body.presentationId) : undefined,
        quantity: String(req.body?.quantity ?? ""),
        type: String(req.body?.type ?? ""),
        cause: String(req.body?.cause ?? ""),
        note: req.body?.note ? String(req.body.note) : undefined,
        lotCode: req.body?.lotCode ? String(req.body.lotCode) : undefined,
      })
      res.json({ ok: true, id: loss.id, totalCost: formatMoney(loss.totalCost, req.tenant!.currency) })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/inventory/losses/:id/void", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await voidLoss(req.tenant!, String(req.params.id), String(req.body?.reason ?? ""))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
