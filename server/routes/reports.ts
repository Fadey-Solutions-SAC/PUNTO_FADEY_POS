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
import { listPaymentMethods } from "../../lib/payment-methods"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

type Tone = "teal" | "indigo" | "emerald" | "red" | "amber" | "violet" | "sky" | "rose" | "slate"

type ReportPayload = {
  description: string
  chartTitle: string
  /** "time": barras verticales en orden de fecha. "rank": barras horizontales de mayor a menor. */
  chartKind: "time" | "rank"
  /** Si la gráfica es de dinero, la app muestra el % de participación de cada fila. */
  chartMoney: boolean
  kpis: { label: string; value: string; tone: Tone; hint?: string }[]
  columns: string[]
  /** Columnas numéricas (alineadas a la derecha). */
  numeric: number[]
  rows: string[][]
  footer?: string[]
  chart: { label: string; value: number; text: string }[]
  empty: string
}

/** "2026-11-19" → "19/11/2026" */
function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-")
  return d && m && y ? `${d}/${m}/${y}` : iso
}

function byValueDesc<T>(entries: [string, T][], value: (row: T) => number) {
  return [...entries].sort((a, b) => value(b[1]) - value(a[1]) || a[0].localeCompare(b[0], "es"))
}

function byDateAsc<T>(entries: [string, T][]) {
  return [...entries].sort((a, b) => a[0].localeCompare(b[0]))
}

function pct(part: number, total: number) {
  if (!total) return "0 %"
  return `${((part / total) * 100).toFixed(1)} %`
}

/** Tabla simple de dinero: Detalle · Total · %, de mayor a menor, con fila de total. */
function moneyRanking(entries: [string, number][], currency: string, label = "Detalle") {
  const sorted = byValueDesc(entries, (value) => value)
  const sum = sorted.reduce((acc, [, value]) => acc + value, 0)
  return {
    columns: [label, "Total", "Participación"],
    numeric: [1, 2],
    rows: sorted.map(([name, value]) => [name, formatMoney(value, currency), pct(value, sum)]),
    footer: ["Total", formatMoney(sum, currency), sorted.length ? "100 %" : "—"],
    chart: sorted.map(([label, value]) => ({ label, value, text: formatMoney(value, currency) })),
    chartKind: "rank" as const,
    chartMoney: true,
  }
}

/** Serie por fecha (dinero), en orden cronológico y con total. */
function moneyByDate(entries: [string, number][], currency: string) {
  const sorted = byDateAsc(entries)
  const sum = sorted.reduce((acc, [, value]) => acc + value, 0)
  return {
    columns: ["Fecha", "Total"],
    numeric: [1],
    rows: sorted.map(([day, value]) => [dayLabel(day), formatMoney(value, currency)]),
    footer: ["Total", formatMoney(sum, currency)],
    chart: sorted.map(([day, value]) => ({ label: dayLabel(day), value, text: formatMoney(value, currency) })),
    chartKind: "time" as const,
    chartMoney: true,
  }
}

function margin(total: number, cost: number) {
  return total ? `${(((total - cost) / total) * 100).toFixed(1)} %` : "—"
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
      const money = (value: number) => formatMoney(value, currency)
      // Nombres de los medios de pago del negocio (Yape, Plin…), no solo los fijos.
      const methodNames = new Map((await listPaymentMethods(ctx)).map((item) => [item.code, item.label]))
      const methodLabel = (code: string) => methodNames.get(code) ?? PAYMENT_LABEL[code] ?? code
      let report: ReportPayload

      if (area === "ventas" || area === "rentabilidad") {
        const data = await salesReport(ctx, range, filter)
        const profitView = area === "rentabilidad"
        const productRows = byValueDesc(data.byProduct, (row) => (profitView ? row.total - row.cost : row.total))
        const categoryRows = byValueDesc(data.byCategory, (row) => (profitView ? row.total - row.cost : row.total))
        const dayRows = byDateAsc(data.byDay)

        let grouped: Omit<ReportPayload, "description" | "chartTitle" | "kpis" | "empty">
        if (!profitView && group === "usuario") grouped = moneyRanking(data.byUser, currency, "Usuario")
        else if (!profitView && group === "pago") {
          grouped = moneyRanking(
            data.byMethod.map(([method, total]) => [methodLabel(method), total]),
            currency,
            "Medio de pago",
          )
        } else if (group === "producto") {
          grouped = {
            columns: profitView
              ? ["Producto", "Venta", "Costo", "Utilidad", "Margen"]
              : ["Producto", "Cantidad", "Venta", "Costo", "Utilidad", "Participación"],
            numeric: profitView ? [1, 2, 3, 4] : [1, 2, 3, 4, 5],
            rows: productRows.map(([name, row]) =>
              profitView
                ? [name, money(row.total), money(row.cost), money(row.total - row.cost), margin(row.total, row.cost)]
                : [
                    name,
                    formatQty(row.qty),
                    money(row.total),
                    money(row.cost),
                    money(row.total - row.cost),
                    pct(row.total, data.total),
                  ],
            ),
            footer: profitView
              ? ["Total", money(data.total), money(data.cost), money(data.gross), margin(data.total, data.cost)]
              : ["Total", "", money(data.total), money(data.cost), money(data.gross), data.total ? "100 %" : "—"],
            chart: productRows.map(([label, row]) => {
              const value = profitView ? row.total - row.cost : row.total
              return { label, value, text: money(value) }
            }),
            chartKind: "rank",
            chartMoney: true,
          }
        } else if (group === "categoria") {
          grouped = {
            columns: ["Categoría", "Venta", "Costo", "Utilidad", profitView ? "Margen" : "Participación"],
            numeric: [1, 2, 3, 4],
            rows: categoryRows.map(([name, row]) => [
              name,
              money(row.total),
              money(row.cost),
              money(row.total - row.cost),
              profitView ? margin(row.total, row.cost) : pct(row.total, data.total),
            ]),
            footer: [
              "Total",
              money(data.total),
              money(data.cost),
              money(data.gross),
              profitView ? margin(data.total, data.cost) : data.total ? "100 %" : "—",
            ],
            chart: categoryRows.map(([label, row]) => {
              const value = profitView ? row.total - row.cost : row.total
              return { label, value, text: money(value) }
            }),
            chartKind: "rank",
            chartMoney: true,
          }
        } else {
          grouped = {
            columns: ["Fecha", "Ventas", "Costo", "Utilidad", "Margen"],
            numeric: [1, 2, 3, 4],
            rows: dayRows.map(([day, row]) => [
              dayLabel(day),
              money(row.total),
              money(row.cost),
              money(row.total - row.cost),
              margin(row.total, row.cost),
            ]),
            footer: ["Total", money(data.total), money(data.cost), money(data.gross), margin(data.total, data.cost)],
            chart: dayRows.map(([day, row]) => {
              const value = profitView ? row.total - row.cost : row.total
              return { label: dayLabel(day), value, text: money(value) }
            }),
            chartKind: "time",
            chartMoney: true,
          }
        }

        report = profitView
          ? {
              description: "Utilidad bruta = venta − costo de lo vendido (netas de devoluciones). No incluye gastos de caja.",
              chartTitle: group === "periodo" ? "Utilidad por día" : group === "categoria" ? "Utilidad por categoría" : "Utilidad por producto",
              kpis: [
                { label: "Ventas", value: money(data.total), tone: "teal" },
                { label: "Costo", value: money(data.cost), tone: "amber" },
                { label: "Utilidad bruta", value: money(data.gross), tone: data.gross >= 0 ? "emerald" : "red" },
                { label: "Margen", value: margin(data.total, data.cost), tone: "violet" },
              ],
              empty: "No hay ventas en este período.",
              ...grouped,
            }
          : {
              description: "Ventas confirmadas del período, netas de devoluciones. Las anuladas no se cuentan.",
              chartTitle:
                group === "usuario"
                  ? "Ventas por usuario"
                  : group === "pago"
                    ? "Ventas por medio de pago"
                    : group === "producto"
                      ? "Productos más vendidos"
                      : group === "categoria"
                        ? "Ventas por categoría"
                        : "Ventas por día",
              kpis: [
                { label: "Ventas", value: money(data.total), tone: "teal" },
                { label: "Operaciones", value: String(data.count), tone: "indigo" },
                { label: "Ticket promedio", value: money(data.ticket), tone: "sky" },
                { label: "Costo", value: money(data.cost), tone: "amber" },
                { label: "Utilidad bruta", value: money(data.gross), tone: data.gross >= 0 ? "emerald" : "red" },
              ],
              empty: "No hay ventas en este período.",
              ...grouped,
            }
      } else if (area === "compras") {
        const data = await purchasesReport(ctx, range, { userId: filter.userId })
        let grouped: Omit<ReportPayload, "description" | "chartTitle" | "kpis" | "empty">
        if (group === "fecha") grouped = moneyByDate(data.byDay, currency)
        else if (group === "producto") grouped = moneyRanking(data.byProduct, currency, "Producto")
        else if (group === "documentos") {
          const docs = [...data.documents].sort((a, b) => b.date.getTime() - a.date.getTime())
          grouped = {
            columns: ["Fecha", "Proveedor", "Documento", "Total", "Pagado", "Saldo", "Estado"],
            numeric: [3, 4, 5],
            rows: docs.map((item) => [
              formatDate(item.date),
              item.supplier,
              item.number,
              money(item.total),
              money(item.paid),
              money(item.total - item.paid),
              PURCHASE_LABEL[item.status] ?? item.status,
            ]),
            footer: ["Total", "", "", money(data.total), money(data.paid), money(data.payable), ""],
            chart: byDateAsc(data.byDay).map(([day, value]) => ({ label: dayLabel(day), value, text: money(value) })),
            chartKind: "time",
            chartMoney: true,
          }
        } else grouped = moneyRanking(data.bySupplier, currency, "Proveedor")
        report = {
          description: "Compras no anuladas del período. Una compra pendiente no suma stock hasta recibirla.",
          chartTitle:
            group === "fecha" || group === "documentos"
              ? "Compras por día"
              : group === "producto"
                ? "Productos más comprados"
                : "Compras por proveedor",
          kpis: [
            { label: "Total comprado", value: money(data.total), tone: "indigo" },
            { label: "Compras", value: String(data.count), tone: "sky" },
            { label: "Proveedores", value: String(data.suppliers), tone: "violet" },
            { label: "Pagado", value: money(data.paid), tone: "emerald" },
            { label: "Por pagar", value: money(data.payable), tone: data.payable > 0 ? "red" : "slate" },
          ],
          empty: "No hay compras en este período.",
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
          const sorted = [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          return {
            columns: ["Fecha", "Producto", "Tipo", "Cantidad", "Usuario"],
            numeric: [3],
            rows: sorted.map((item) => [
              formatDate(item.createdAt),
              item.product.name,
              MOVE_LABEL[item.type] ?? item.type,
              formatQty(item.quantity),
              item.user.name,
            ]),
            chart: byValueDesc([...byType.entries()], (value) => value).map(([label, value]) => ({
              label,
              value,
              text: formatQty(value),
            })),
            chartKind: "rank" as const,
            chartMoney: false,
          }
        }
        let grouped: Omit<ReportPayload, "description" | "chartTitle" | "kpis" | "empty">
        if (group === "entradas") grouped = movementRows(moves.entries)
        else if (group === "salidas") grouped = movementRows(moves.exits)
        else if (group === "transferencias") grouped = movementRows(moves.transfers)
        else if (group === "ajustes") grouped = movementRows(moves.adjustments)
        else if (group === "vencimientos") {
          const lots = [...stock.expiries].sort(
            (a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity),
          )
          grouped = {
            columns: ["Producto", "Lote", "Vence", "Cantidad"],
            numeric: [3],
            rows: lots.map((lot) => [lot.name, lot.code, lot.expiresAt ? formatDate(lot.expiresAt) : "—", formatQty(lot.quantity)]),
            chart: lots.map((lot) => ({ label: lot.name, value: lot.quantity, text: formatQty(lot.quantity) })),
            chartKind: "rank",
            chartMoney: false,
          }
        } else {
          const rows = [...stock.rows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "es"))
          grouped = {
            columns: ["Producto", "Stock", "Estado", "Valor al costo", "Participación"],
            numeric: [1, 3, 4],
            rows: rows.map((row) => [row.name, formatQty(row.quantity), row.state, money(row.value), pct(row.value, stock.value)]),
            footer: ["Total", "", "", money(stock.value), stock.value ? "100 %" : "—"],
            chart: rows.map((row) => ({ label: row.name, value: row.value, text: money(row.value) })),
            chartKind: "rank",
            chartMoney: true,
          }
        }
        report = {
          description: `Existencias actuales del almacén ${ctx.warehouseName}. Los movimientos usan el período elegido.`,
          chartTitle:
            group === "existencias" || !group
              ? "Valor del inventario por producto"
              : group === "vencimientos"
                ? "Lotes por vencer"
                : "Cantidades por tipo de movimiento",
          kpis: [
            { label: "Productos", value: String(stock.rows.length), tone: "sky" },
            { label: "Valor al costo", value: money(stock.value), tone: "teal" },
            { label: "Stock bajo", value: String(stock.low.length), tone: "amber" },
            { label: "Agotados", value: String(stock.empty.length), tone: "red" },
          ],
          empty: "Sin datos para mostrar.",
          ...grouped,
        }
      } else if (area === "caja") {
        const data = await cashReport(ctx, range, filter)
        let grouped: Omit<ReportPayload, "description" | "chartTitle" | "kpis" | "empty">
        if (group === "cierres") {
          const closed = [...data.closed].sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))
          const diffSum = closed.reduce((acc, item) => acc + (item.difference ?? 0), 0)
          grouped = {
            columns: ["Cierre", "Caja", "Usuario", "Esperado", "Contado", "Diferencia"],
            numeric: [3, 4, 5],
            rows: closed.map((item) => [
              item.closedAt ? formatDate(item.closedAt) : "—",
              item.register.name,
              item.user.name,
              money(item.expectedAmount ?? 0),
              money(item.countedAmount ?? 0),
              money(item.difference ?? 0),
            ]),
            footer: ["Total", "", "", "", "", money(diffSum)],
            chart: closed.map((item) => ({
              label: `${item.register.name} · ${item.closedAt ? formatDate(item.closedAt) : ""}`,
              value: item.difference ?? 0,
              text: money(item.difference ?? 0),
            })),
            chartKind: "rank",
            chartMoney: false,
          }
        } else if (group === "movimientos") {
          const movements = [...data.movements].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          const byType = new Map<string, number>()
          for (const item of movements) {
            const label = CASH_LABEL[item.type] ?? item.type
            byType.set(label, (byType.get(label) ?? 0) + item.amount)
          }
          grouped = {
            columns: ["Fecha", "Tipo", "Usuario", "Motivo", "Monto"],
            numeric: [4],
            rows: movements.map((item) => [
              formatDate(item.createdAt),
              CASH_LABEL[item.type] ?? item.type,
              item.user.name,
              item.reason,
              money(item.amount),
            ]),
            chart: byValueDesc([...byType.entries()], (value) => value).map(([label, value]) => ({
              label,
              value,
              text: money(value),
            })),
            chartKind: "rank",
            chartMoney: true,
          }
        } else {
          grouped = moneyRanking(
            data.sales.map(([method, total]) => [methodLabel(method), total]),
            currency,
            "Medio de pago",
          )
        }
        report = {
          description: "Ventas cobradas por medio de pago, movimientos manuales y cierres del período.",
          chartTitle: group === "cierres" ? "Diferencias de cierre" : group === "movimientos" ? "Movimientos por tipo" : "Cobros por medio de pago",
          kpis: [
            { label: "Ingresos de caja", value: money(data.cashIn), tone: "emerald" },
            { label: "Egresos de caja", value: money(data.cashOut), tone: "red" },
            { label: "Aperturas", value: String(data.opened.length), tone: "sky" },
            { label: "Cierres", value: String(data.closed.length), tone: "indigo" },
          ],
          empty: "Sin movimientos en este período.",
          ...grouped,
        }
      } else if (area === "clientes") {
        const data = await customerReport(ctx, range, filter)
        let grouped: Omit<ReportPayload, "description" | "chartTitle" | "kpis" | "empty">
        if (group === "creditos") {
          const credits = [...data.credits].sort((a, b) => b.balance - a.balance)
          grouped = {
            columns: ["Cliente", "Saldo por cobrar", "Participación"],
            numeric: [1, 2],
            rows: credits.map((customer) => [customer.name, money(customer.balance), pct(customer.balance, data.receivable)]),
            footer: ["Total", money(data.receivable), data.receivable ? "100 %" : "—"],
            chart: credits.map((customer) => ({ label: customer.name, value: customer.balance, text: money(customer.balance) })),
            chartKind: "rank",
            chartMoney: true,
          }
        } else {
          const buyers = data.purchases
            .filter(([id]) => id !== "publico")
            .map(([, row]) => row)
            .sort((a, b) => b.total - a.total)
          const sum = buyers.reduce((acc, row) => acc + row.total, 0)
          grouped = {
            columns: ["Cliente", "Operaciones", "Compras", "Participación"],
            numeric: [1, 2, 3],
            rows: buyers.map((row) => [row.name, String(row.count), money(row.total), pct(row.total, sum)]),
            footer: ["Total", String(buyers.reduce((acc, row) => acc + row.count, 0)), money(sum), sum ? "100 %" : "—"],
            chart: buyers.map((row) => ({ label: row.name, value: row.total, text: money(row.total) })),
            chartKind: "rank",
            chartMoney: true,
          }
        }
        report = {
          description: "Compras de clientes registrados en el período (sin “Público”) y saldos a crédito actuales.",
          chartTitle: group === "creditos" ? "Saldos por cobrar" : "Mejores clientes",
          kpis: [
            { label: "Clientes", value: String(data.totalCustomers), tone: "sky" },
            { label: "Con compras", value: String(data.buyers), tone: "teal" },
            { label: "Frecuentes", value: String(data.frequent.length), tone: "violet" },
            { label: "Por cobrar", value: money(data.receivable), tone: data.receivable > 0 ? "amber" : "slate" },
          ],
          empty: "Sin clientes con movimiento en este período.",
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
