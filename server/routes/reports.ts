import type { Express } from "express"
import { errorMessage } from "../../lib/errors"
import { CASH_LABEL, MOVE_LABEL, PAYMENT_LABEL, PURCHASE_LABEL } from "../../lib/labels"
import { formatDate, formatMoney, formatQty } from "../../lib/money"
import {
  cashReport,
  customerReport,
  inventoryMovements,
  inventoryReport,
  parseRange,
  purchasesReport,
  salesReport,
} from "../../lib/reports"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

type ReportPayload = {
  description: string
  chartTitle: string
  kpis: { label: string; value: string }[]
  columns: string[]
  rows: string[][]
  chart: { label: string; value: number; text: string }[]
}

function moneyRows(entries: [string, number][], currency: string): Pick<ReportPayload, "columns" | "rows" | "chart"> {
  return {
    columns: ["Detalle", "Total"],
    rows: entries.map(([name, total]) => [name, formatMoney(total, currency)]),
    chart: entries.map(([label, value]) => ({ label, value, text: formatMoney(value, currency) })),
  }
}

export function registerReportsRoutes(app: Express) {
  app.get("/api/reports", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "reports", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de informes" })
        return
      }
      const area = String(req.query.area ?? "")
      const group = String(req.query.grupo ?? "")
      const range = parseRange(
        req.query.desde ? String(req.query.desde) : undefined,
        req.query.hasta ? String(req.query.hasta) : undefined,
      )
      const filter = {
        branchId: req.query.sucursal ? String(req.query.sucursal) : undefined,
        userId: req.query.usuario ? String(req.query.usuario) : undefined,
      }
      const currency = ctx.currency
      let report: ReportPayload

      if (area === "ventas") {
        const data = await salesReport(ctx, range, filter)
        const grouped =
          group === "usuario"
            ? moneyRows(data.byUser, currency)
            : group === "pago"
              ? moneyRows(
                  data.byMethod.map(([method, total]) => [PAYMENT_LABEL[method] ?? method, total]),
                  currency,
                )
              : group === "producto"
                ? {
                    columns: ["Producto", "Cantidad", "Venta", "Costo", "Utilidad"],
                    rows: data.byProduct.map(([name, row]) => [
                      name,
                      formatQty(row.qty),
                      formatMoney(row.total, currency),
                      formatMoney(row.cost, currency),
                      formatMoney(row.total - row.cost, currency),
                    ]),
                    chart: data.byProduct.map(([label, row]) => ({
                      label,
                      value: row.total,
                      text: formatMoney(row.total, currency),
                    })),
                  }
                : group === "categoria"
                  ? {
                      columns: ["Categoría", "Venta", "Costo", "Utilidad"],
                      rows: data.byCategory.map(([name, row]) => [
                        name,
                        formatMoney(row.total, currency),
                        formatMoney(row.cost, currency),
                        formatMoney(row.total - row.cost, currency),
                      ]),
                      chart: data.byCategory.map(([label, row]) => ({
                        label,
                        value: row.total,
                        text: formatMoney(row.total, currency),
                      })),
                    }
                  : {
                      columns: ["Día", "Ventas", "Costo"],
                      rows: data.byDay.map(([day, row]) => [
                        day,
                        formatMoney(row.total, currency),
                        formatMoney(row.cost, currency),
                      ]),
                      chart: data.byDay.map(([label, row]) => ({
                        label,
                        value: row.total,
                        text: formatMoney(row.total, currency),
                      })),
                    }
        report = {
          description: "Ventas completadas del período, netas de devoluciones.",
          chartTitle: "Ventas",
          kpis: [
            { label: "Ventas", value: formatMoney(data.total, currency) },
            { label: "Operaciones", value: String(data.count) },
            { label: "Costo", value: formatMoney(data.cost, currency) },
            { label: "Utilidad bruta", value: formatMoney(data.gross, currency) },
            { label: "Ticket", value: formatMoney(data.ticket, currency) },
          ],
          ...grouped,
        }
      } else if (area === "compras") {
        const data = await purchasesReport(ctx, range, { userId: filter.userId })
        const grouped =
          group === "fecha"
            ? moneyRows(data.byDay, currency)
            : group === "producto"
              ? moneyRows(data.byProduct, currency)
              : group === "documentos"
                ? {
                    columns: ["Fecha", "Proveedor", "Documento", "Total", "Pagado", "Estado"],
                    rows: data.documents.map((item) => [
                      formatDate(item.date),
                      item.supplier,
                      item.number,
                      formatMoney(item.total, currency),
                      formatMoney(item.paid, currency),
                      PURCHASE_LABEL[item.status] ?? item.status,
                    ]),
                    chart: data.byDay.map(([label, value]) => ({
                      label,
                      value,
                      text: formatMoney(value, currency),
                    })),
                  }
                : moneyRows(data.bySupplier, currency)
        report = {
          description: "Compras no anuladas del período.",
          chartTitle: "Compras",
          kpis: [
            { label: "Total", value: formatMoney(data.total, currency) },
            { label: "Compras", value: String(data.count) },
            { label: "Proveedores", value: String(data.suppliers) },
            { label: "Pagado", value: formatMoney(data.paid, currency) },
            { label: "Por pagar", value: formatMoney(data.payable, currency) },
          ],
          ...grouped,
        }
      } else if (area === "inventario") {
        const [stock, moves] = await Promise.all([inventoryReport(ctx), inventoryMovements(ctx, range)])
        const movementRows = (items: typeof moves.entries) => {
          const byType = new Map<string, number>()
          for (const item of items) {
            const label = MOVE_LABEL[item.type] ?? item.type
            byType.set(label, (byType.get(label) ?? 0) + Math.abs(item.quantity))
          }
          return {
            columns: ["Fecha", "Producto", "Tipo", "Cantidad", "Usuario"],
            rows: items.map((item) => [
              formatDate(item.createdAt),
              item.product.name,
              MOVE_LABEL[item.type] ?? item.type,
              formatQty(item.quantity),
              item.user.name,
            ]),
            chart: [...byType.entries()].map(([label, value]) => ({
              label,
              value,
              text: formatQty(value),
            })),
          }
        }
        const grouped =
          group === "entradas"
            ? movementRows(moves.entries)
            : group === "salidas"
              ? movementRows(moves.exits)
              : group === "transferencias"
                ? movementRows(moves.transfers)
                : group === "ajustes"
                  ? movementRows(moves.adjustments)
                  : group === "vencimientos"
                    ? {
                        columns: ["Producto", "Lote", "Vence", "Cantidad"],
                        rows: stock.expiries.map((lot) => [
                          lot.name,
                          lot.code,
                          lot.expiresAt ? formatDate(lot.expiresAt) : "—",
                          formatQty(lot.quantity),
                        ]),
                        chart: stock.expiries.map((lot) => ({
                          label: lot.name,
                          value: lot.quantity,
                          text: formatQty(lot.quantity),
                        })),
                      }
                    : {
                        columns: ["Producto", "Stock", "Estado", "Valor"],
                        rows: stock.rows.map((row) => [
                          row.name,
                          formatQty(row.quantity),
                          row.state,
                          formatMoney(row.value, currency),
                        ]),
                        chart: stock.rows.map((row) => ({
                          label: row.name,
                          value: row.value,
                          text: formatMoney(row.value, currency),
                        })),
                      }
        report = {
          description: `Existencias del almacén ${ctx.warehouseName}.`,
          chartTitle: "Inventario",
          kpis: [
            { label: "SKUs", value: String(stock.rows.length) },
            { label: "Valor", value: formatMoney(stock.value, currency) },
            { label: "Bajos", value: String(stock.low.length) },
            { label: "Agotados", value: String(stock.empty.length) },
          ],
          ...grouped,
        }
      } else if (area === "caja") {
        const data = await cashReport(ctx, range, filter)
        const grouped =
          group === "cierres"
            ? {
                columns: ["Cierre", "Caja", "Usuario", "Esperado", "Contado", "Diferencia"],
                rows: data.closed.map((item) => [
                  item.closedAt ? formatDate(item.closedAt) : "—",
                  item.register.name,
                  item.user.name,
                  formatMoney(item.expectedAmount ?? 0, currency),
                  formatMoney(item.countedAmount ?? 0, currency),
                  formatMoney(item.difference ?? 0, currency),
                ]),
                chart: data.closed.map((item) => ({
                  label: item.register.name,
                  value: item.difference ?? 0,
                  text: formatMoney(item.difference ?? 0, currency),
                })),
              }
            : group === "movimientos"
              ? {
                  columns: ["Fecha", "Tipo", "Usuario", "Motivo", "Monto"],
                  rows: data.movements.map((item) => [
                    formatDate(item.createdAt),
                    CASH_LABEL[item.type] ?? item.type,
                    item.user.name,
                    item.reason,
                    formatMoney(item.amount, currency),
                  ]),
                  chart: data.movements.slice(0, 8).map((item) => ({
                    label: CASH_LABEL[item.type] ?? item.type,
                    value: item.amount,
                    text: formatMoney(item.amount, currency),
                  })),
                }
              : moneyRows(
                  data.sales.map(([method, total]) => [PAYMENT_LABEL[method] ?? method, total]),
                  currency,
                )
        report = {
          description: "Movimientos y cierres del período.",
          chartTitle: "Caja",
          kpis: [
            { label: "Ingresos de caja", value: formatMoney(data.cashIn, currency) },
            { label: "Egresos de caja", value: formatMoney(data.cashOut, currency) },
            { label: "Aperturas", value: String(data.opened.length) },
            { label: "Cierres", value: String(data.closed.length) },
          ],
          ...grouped,
        }
      } else if (area === "rentabilidad") {
        const data = await salesReport(ctx, range, filter)
        const grouped =
          group === "categoria"
            ? {
                columns: ["Categoría", "Venta", "Costo", "Margen"],
                rows: data.byCategory.map(([name, row]) => [
                  name,
                  formatMoney(row.total, currency),
                  formatMoney(row.cost, currency),
                  formatMoney(row.total - row.cost, currency),
                ]),
                chart: data.byCategory.map(([label, row]) => ({
                  label,
                  value: row.total - row.cost,
                  text: formatMoney(row.total - row.cost, currency),
                })),
              }
            : group === "periodo"
              ? {
                  columns: ["Día", "Venta", "Costo", "Margen"],
                  rows: data.byDay.map(([day, row]) => [
                    day,
                    formatMoney(row.total, currency),
                    formatMoney(row.cost, currency),
                    formatMoney(row.total - row.cost, currency),
                  ]),
                  chart: data.byDay.map(([label, row]) => ({
                    label,
                    value: row.total - row.cost,
                    text: formatMoney(row.total - row.cost, currency),
                  })),
                }
              : {
                  columns: ["Producto", "Venta", "Costo", "Margen"],
                  rows: data.byProduct.map(([name, row]) => [
                    name,
                    formatMoney(row.total, currency),
                    formatMoney(row.cost, currency),
                    formatMoney(row.total - row.cost, currency),
                  ]),
                  chart: data.byProduct.map(([label, row]) => ({
                    label,
                    value: row.total - row.cost,
                    text: formatMoney(row.total - row.cost, currency),
                  })),
                }
        report = {
          description: "Utilidad bruta = venta − costo. No es utilidad neta.",
          chartTitle: "Rentabilidad",
          kpis: [
            { label: "Ventas", value: formatMoney(data.total, currency) },
            { label: "Costo", value: formatMoney(data.cost, currency) },
            { label: "Utilidad bruta", value: formatMoney(data.gross, currency) },
          ],
          ...grouped,
        }
      } else if (area === "clientes") {
        const data = await customerReport(ctx, range, filter)
        const grouped =
          group === "creditos"
            ? {
                columns: ["Cliente", "Saldo por cobrar"],
                rows: data.credits.map((customer) => [customer.name, formatMoney(customer.balance, currency)]),
                chart: data.credits.map((customer) => ({
                  label: customer.name,
                  value: customer.balance,
                  text: formatMoney(customer.balance, currency),
                })),
              }
            : {
                columns: ["Cliente", "Operaciones", "Compras"],
                rows: data.purchases
                  .filter(([id]) => id !== "publico")
                  .map(([, row]) => [row.name, String(row.count), formatMoney(row.total, currency)]),
                chart: data.purchases
                  .filter(([id]) => id !== "publico")
                  .map(([, row]) => ({
                    label: row.name,
                    value: row.total,
                    text: formatMoney(row.total, currency),
                  })),
              }
        report = {
          description: "Clientes del período.",
          chartTitle: "Clientes",
          kpis: [
            { label: "Clientes", value: String(data.totalCustomers) },
            { label: "Con compras", value: String(data.buyers) },
            { label: "Frecuentes", value: String(data.frequent.length) },
            { label: "Cuentas por cobrar", value: formatMoney(data.receivable, currency) },
          ],
          ...grouped,
        }
      } else {
        res.status(400).json({ error: "Área de informe inválida" })
        return
      }

      res.json(report)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
