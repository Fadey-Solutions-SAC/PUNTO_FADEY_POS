/**
 * Consultas de PIX sobre los datos del propio negocio (solo lectura).
 * Cada función devuelve texto listo para el chat; los permisos se revisan en `lib/pix/engine.ts`
 * y aquí solo se decide qué cifras mostrar (dinero, costos) según el rol.
 */
import { prisma } from "@/lib/db"
import { hasFullCashAccess, summarizeSession } from "@/lib/cash"
import { PAYMENT_LABEL, PURCHASE_LABEL } from "@/lib/labels"
import { mulScale } from "@/lib/money"
import { salesReport } from "@/lib/reports"
import { can } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"
import { dayText, fold, money, pct, previousPeriod, qtyText, type Period } from "@/lib/pix/text"

/** `download`: el botón descarga el archivo (plantillas) en lugar de abrir una pantalla. */
export type Link = { label: string; href: string; download?: boolean }
/** Tarjeta de indicador que el chat muestra arriba de la respuesta. */
export type Kpi = { label: string; value: string; hint?: string; tone?: "blue" | "gold" | "green" | "red" | "slate"; trend?: "up" | "down" }
export type ToolResult = { text: string; links?: Link[]; kpis?: Kpi[] }

function trendKpi(current: number, before: number): Pick<Kpi, "hint" | "trend" | "tone"> {
  if (!before) return { hint: "sin período anterior", tone: "blue" }
  const diff = ((current - before) / Math.abs(before)) * 100
  return { hint: `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(0)} % vs. anterior`, trend: diff >= 0 ? "up" : "down", tone: diff >= 0 ? "green" : "red" }
}

const DAY = 24 * 60 * 60 * 1000

export function canReports(ctx: TenantContext) {
  return can(ctx.role, "reports", ctx.grants)
}

function canSeeCost(ctx: TenantContext) {
  return canReports(ctx) || can(ctx.role, "catalogWrite", ctx.grants) || can(ctx.role, "priceWrite", ctx.grants)
}

function change(current: number, before: number, label: string, currency: string) {
  if (!before) return ""
  const diff = ((current - before) / Math.abs(before)) * 100
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "="
  return `${arrow} ${Math.abs(diff).toFixed(1)} % frente a ${label}: ${money(before, currency)}.`
}

/* ───────────────────────── Ventas ───────────────────────── */

/** Ventas netas (ventas − devoluciones) de un rango, opcionalmente de un solo usuario. */
async function netSales(ctx: TenantContext, period: Period, userId?: string) {
  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: period.from, lte: period.to }, ...(userId ? { userId } : {}) },
      select: { total: true, payments: { select: { method: true, amount: true } } },
    }),
    prisma.saleReturn.findMany({
      where: { businessId: ctx.businessId, createdAt: { gte: period.from, lte: period.to }, ...(userId ? { userId } : {}) },
      select: { total: true },
    }),
  ])
  const gross = sales.reduce((sum, sale) => sum + sale.total, 0)
  const returned = returns.reduce((sum, item) => sum + item.total, 0)
  const byMethod = new Map<string, number>()
  for (const sale of sales) for (const p of sale.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)
  return { count: sales.length, total: gross - returned, returned, byMethod }
}

export async function salesSummary(ctx: TenantContext, period: Period, opts: { method?: string } = {}): Promise<ToolResult> {
  const full = canReports(ctx)
  const own = full ? undefined : ctx.userId
  const now = await netSales(ctx, period, own)
  const who = full ? "" : " (solo tus ventas)"
  if (opts.method) {
    const label = PAYMENT_LABEL[opts.method] ?? opts.method
    const amount = now.byMethod.get(opts.method) ?? 0
    const all = [...now.byMethod.values()].reduce((a, b) => a + b, 0)
    return { text: `Ventas en **${label}** ${period.label}${who}: **${money(amount, ctx.currency)}** (${pct(amount, all)} de lo cobrado).` }
  }
  if (!now.count && !now.returned) {
    return { text: `No hay ventas registradas ${period.label}${who}.`, links: [{ label: "Ir a Caja", href: "/ventas" }] }
  }
  const before = await netSales(ctx, previousPeriod(period), own)
  const lines = [
    `Ventas ${period.label}${who}: **${money(now.total, ctx.currency)}** en ${now.count} venta(s).`,
    `Ticket promedio: ${money(now.count ? Math.round(now.total / now.count) : 0, ctx.currency)}.`,
  ]
  if (now.returned) lines.push(`Devoluciones descontadas: ${money(now.returned, ctx.currency)}.`)
  const prev = previousPeriod(period)
  const cmp = change(now.total, before.total, prev.label, ctx.currency)
  if (cmp) lines.push(cmp)
  if (now.byMethod.size) {
    const all = [...now.byMethod.values()].reduce((a, b) => a + b, 0)
    lines.push(
      "",
      "Por método de pago:",
      ...[...now.byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([method, amount]) => `- ${PAYMENT_LABEL[method] ?? method}: ${money(amount, ctx.currency)} (${pct(amount, all)})`),
    )
  }
  if (full) {
    const report = await salesReport(ctx, { from: period.from, to: period.to })
    lines.push("", `Tu ganancia bruta estimada (venta − costo): **${money(report.gross, ctx.currency)}** · margen ${pct(report.gross, report.total)}.`)
  }
  const kpis: Kpi[] = [
    { label: "Ventas", value: money(now.total, ctx.currency), ...trendKpi(now.total, before.total) },
    { label: "N.º de ventas", value: String(now.count), tone: "slate" },
    { label: "Ticket promedio", value: money(now.count ? Math.round(now.total / now.count) : 0, ctx.currency), tone: "gold" },
  ]
  if (full) {
    const report = await salesReport(ctx, { from: period.from, to: period.to })
    kpis.push({ label: "Margen bruto", value: pct(report.gross, report.total), hint: money(report.gross, ctx.currency), tone: report.total && report.gross / report.total < 0.15 ? "red" : "green" })
  }
  return { text: lines.join("\n"), kpis, links: full ? [{ label: "Ver informes", href: "/informes" }] : [{ label: "Historial de ventas", href: "/ventas/historial" }] }
}

/** Productos más (o menos) vendidos. Sin permiso de informes se muestran solo cantidades. */
export async function topProducts(ctx: TenantContext, period: Period, opts: { least?: boolean; byMoney?: boolean; limit?: number } = {}): Promise<ToolResult> {
  const limit = opts.limit ?? 10
  const showMoney = canReports(ctx)
  let rows: { name: string; qty: number; total: number }[]
  if (showMoney) {
    const report = await salesReport(ctx, { from: period.from, to: period.to })
    rows = report.byProduct.map(([name, row]) => ({ name, qty: row.qty, total: row.total }))
  } else {
    const lines = await prisma.saleLine.findMany({
      where: { sale: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: period.from, lte: period.to } } },
      select: { productId: true, quantity: true, product: { select: { name: true } } },
    })
    const map = new Map<string, { name: string; qty: number; total: number }>()
    for (const line of lines) {
      const row = map.get(line.productId) ?? { name: line.product.name, qty: 0, total: 0 }
      row.qty += line.quantity
      map.set(line.productId, row)
    }
    rows = [...map.values()]
  }
  rows = rows.filter((row) => row.qty > 0)
  if (!rows.length) return { text: `Aún no hay ventas ${period.label} para calcular los productos más vendidos.` }
  const key = opts.byMoney && showMoney ? (r: { total: number }) => r.total : (r: { qty: number }) => r.qty
  rows.sort((a, b) => (opts.least ? key(a) - key(b) : key(b) - key(a)) || a.name.localeCompare(b.name, "es"))
  const title = opts.least ? `Productos menos vendidos ${period.label}` : `Productos más vendidos ${period.label}${opts.byMoney && showMoney ? " (por importe)" : ""}`
  const list = rows.slice(0, limit).map((row, i) => `${i + 1}. ${row.name} — ${qtyText(row.qty)} und${showMoney ? ` · ${money(row.total, ctx.currency)}` : ""}`)
  const extra = opts.least ? ["", "Solo cuenta productos con al menos una venta; los que no se vendieron nada los ves con «productos sin movimiento»."] : []
  return { text: [`**${title}:**`, ...list, ...extra].join("\n"), links: showMoney ? [{ label: "Informe de ventas", href: "/informes" }] : undefined }
}

export async function topBrands(ctx: TenantContext, period: Period): Promise<ToolResult> {
  const report = await salesReport(ctx, { from: period.from, to: period.to })
  const rows = report.byCategory.filter(([, row]) => row.total !== 0).sort((a, b) => b[1].total - a[1].total)
  if (!rows.length) return { text: `No hay ventas ${period.label} para comparar marcas.` }
  const list = rows.slice(0, 10).map(([name, row], i) => `${i + 1}. ${name} — ${money(row.total, ctx.currency)} (${pct(row.total, report.total)}) · ganancia ${money(row.total - row.cost, ctx.currency)}`)
  return { text: [`**Ventas por marca ${period.label}:**`, ...list].join("\n"), links: [{ label: "Informes", href: "/informes" }] }
}

export async function salesBySeller(ctx: TenantContext, period: Period): Promise<ToolResult> {
  const report = await salesReport(ctx, { from: period.from, to: period.to })
  const rows = report.byUser.filter(([, total]) => total !== 0).sort((a, b) => b[1] - a[1])
  if (!rows.length) return { text: `No hay ventas ${period.label}.` }
  const list = rows.map(([name, total], i) => `${i + 1}. ${name} — ${money(total, ctx.currency)} (${pct(total, report.total)})`)
  return { text: [`**Ventas por vendedor ${period.label}:**`, ...list].join("\n") }
}

/** Horas y días de la semana con más ventas (para planificar turnos y reposición). */
export async function salesPeaks(ctx: TenantContext, period: Period): Promise<ToolResult> {
  const sales = await prisma.sale.findMany({
    where: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: period.from, lte: period.to } },
    select: { total: true, createdAt: true },
  })
  if (!sales.length) return { text: `No hay ventas ${period.label} para ver horas punta.` }
  const byHour = new Map<number, { count: number; total: number }>()
  const byDow = new Map<number, { count: number; total: number }>()
  for (const sale of sales) {
    const h = sale.createdAt.getHours()
    const d = sale.createdAt.getDay()
    const hr = byHour.get(h) ?? { count: 0, total: 0 }
    hr.count += 1
    hr.total += sale.total
    byHour.set(h, hr)
    const dw = byDow.get(d) ?? { count: 0, total: 0 }
    dw.count += 1
    dw.total += sale.total
    byDow.set(d, dw)
  }
  const dows = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
  const hours = [...byHour.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 4)
  const days = [...byDow.entries()].sort((a, b) => b[1].total - a[1].total)
  return {
    text: [
      `**Horas con más ventas ${period.label}:**`,
      ...hours.map(([h, row], i) => `${i + 1}. ${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00 — ${money(row.total, ctx.currency)} en ${row.count} venta(s)`),
      "",
      "**Por día de la semana:**",
      ...days.map(([d, row]) => `- ${dows[d]}: ${money(row.total, ctx.currency)} (${row.count})`),
      "",
      "Tip: refuerza la caja y repón góndolas antes de la hora punta.",
    ].join("\n"),
  }
}

/* ───────────────────────── Productos y stock ───────────────────────── */

type FoundProduct = Awaited<ReturnType<typeof searchProducts>>[number]

export async function searchProducts(ctx: TenantContext, terms: string[], barcode?: string) {
  const include = {
    brand: { select: { name: true } },
    baseUnit: { select: { symbol: true } },
    balances: { include: { warehouse: { select: { name: true, isActive: true } } } },
    presentations: { where: { isActive: true }, select: { name: true, price: true, factorToBase: true, isDefault: true } },
    lots: { where: { quantity: { gt: 0 }, expiresAt: { not: null } }, select: { expiresAt: true, quantity: true }, orderBy: { expiresAt: "asc" as const }, take: 3 },
  }
  if (barcode) {
    const byCode = await prisma.product.findMany({
      where: { businessId: ctx.businessId, isActive: true, OR: [{ internalCode: barcode }, { barcodes: { some: { code: barcode } } }] },
      include,
      take: 5,
    })
    if (byCode.length || !terms.length) return byCode
  }
  if (!terms.length) return []
  const candidates = await prisma.product.findMany({
    where: {
      businessId: ctx.businessId,
      isActive: true,
      OR: terms.flatMap((term) => {
        const upper = term.toUpperCase()
        return [{ name: { contains: upper } }, { name: { contains: term } }, { internalCode: { contains: term } }, { brand: { name: { contains: upper } } }]
      }),
    },
    include,
    take: 200,
  })
  // Puntaje: cuántos términos aparecen en «marca + nombre» (sin tildes).
  const scored = candidates
    .map((product) => {
      const hay = fold(`${product.brand?.name ?? ""} ${product.name} ${product.internalCode}`)
      const hits = terms.filter((term) => hay.includes(fold(term))).length
      return { product, hits }
    })
    .filter((row) => row.hits > 0)
  const max = Math.max(0, ...scored.map((row) => row.hits))
  return scored
    .filter((row) => row.hits === max)
    .sort((a, b) => a.product.name.length - b.product.name.length)
    .map((row) => row.product)
    .slice(0, 8)
}

function stockLines(product: FoundProduct) {
  const active = product.balances.filter((b) => b.warehouse.isActive)
  const total = active.reduce((sum, b) => sum + b.quantity, 0)
  const per = active.length > 1 ? ` (${active.map((b) => `${b.warehouse.name}: ${qtyText(b.quantity)}`).join(" · ")})` : ""
  return { total, text: `${qtyText(total)} ${product.baseUnit.symbol}${per}` }
}

export async function productInfo(ctx: TenantContext, products: FoundProduct[], focus: "price" | "stock" | "both"): Promise<ToolResult> {
  const showCost = canSeeCost(ctx)
  if (products.length > 3) {
    const list = products.map((p) => {
      const stock = stockLines(p)
      return `- ${p.name}${p.brand ? ` (${p.brand.name})` : ""}: ${money(p.salePrice, ctx.currency)} · stock ${stock.text}`
    })
    return { text: [`Encontré ${products.length} productos:`, ...list, "", "Dime el nombre completo para ver el detalle de uno."].join("\n"), links: [{ label: "Productos y marcas", href: "/productos" }] }
  }
  const blocks = products.map((p) => {
    const stock = stockLines(p)
    const lines = [`**${p.name}**${p.brand ? ` · ${p.brand.name}` : ""} · código ${p.internalCode}`]
    if (focus !== "stock") {
      lines.push(`Precio de venta: **${money(p.salePrice, ctx.currency)}**${p.wholesalePrice ? ` · por mayor ${money(p.wholesalePrice, ctx.currency)}` : ""}`)
      const extra = p.presentations.filter((pr) => pr.price && pr.factorToBase !== 10_000)
      if (extra.length) lines.push(`Presentaciones: ${extra.map((pr) => `${pr.name} ${money(pr.price ?? 0, ctx.currency)}`).join(" · ")}`)
      if (showCost) {
        const margin = p.salePrice ? ((p.salePrice - p.costPrice) / p.salePrice) * 100 : 0
        lines.push(`Costo: ${money(p.costPrice, ctx.currency)} · margen ${margin.toFixed(1)} %${p.costPrice > p.salePrice ? " ⚠️ se vende bajo el costo" : ""}`)
      }
    }
    if (focus !== "price") {
      const low = p.minStock > 0 && stock.total <= p.minStock
      lines.push(`Stock: **${stock.text}**${stock.total <= 0 ? " — agotado" : low ? ` — bajo el mínimo (${qtyText(p.minStock)})` : ""}`)
      const lot = p.lots[0]
      if (lot?.expiresAt) {
        const days = Math.ceil((lot.expiresAt.getTime() - Date.now()) / DAY)
        lines.push(`Vence primero: ${qtyText(lot.quantity)} el ${dayText(lot.expiresAt)} (${days < 0 ? `venció hace ${-days} día(s)` : `en ${days} día(s)`})`)
      }
    }
    return lines.join("\n")
  })
  return { text: blocks.join("\n\n"), links: [{ label: "Productos y marcas", href: "/productos" }, { label: "Almacenes", href: "/inventario/almacenes" }] }
}

/** Agotados y bajo mínimo en todos los almacenes activos (sumados) y en el actual. */
export async function lowStock(ctx: TenantContext): Promise<ToolResult> {
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, isActive: true, variants: { none: {} } },
    select: { name: true, minStock: true, balances: { where: { warehouse: { isActive: true } }, select: { quantity: true, warehouseId: true } }, baseUnit: { select: { symbol: true } } },
  })
  const empty: string[] = []
  const low: { name: string; qty: number; min: number; unit: string }[] = []
  for (const p of products) {
    const qty = p.balances.reduce((sum, b) => sum + b.quantity, 0)
    if (qty <= 0) empty.push(p.name)
    else if (p.minStock > 0 && qty <= p.minStock) low.push({ name: p.name, qty, min: p.minStock, unit: p.baseUnit.symbol })
  }
  if (!empty.length && !low.length) return { text: "Todo en orden: no hay productos agotados ni bajo su stock mínimo. ✅" }
  low.sort((a, b) => a.qty / a.min - b.qty / b.min)
  const lines: string[] = []
  if (low.length) {
    lines.push(`**Bajo el mínimo (${low.length}):**`, ...low.slice(0, 12).map((r) => `- ${r.name}: ${qtyText(r.qty)} ${r.unit} (mín. ${qtyText(r.min)})`))
    if (low.length > 12) lines.push(`…y ${low.length - 12} más.`)
  }
  if (empty.length) {
    lines.push("", `**Agotados (${empty.length}):**`, ...empty.slice(0, 12).map((name) => `- ${name}`))
    if (empty.length > 12) lines.push(`…y ${empty.length - 12} más.`)
  }
  lines.push("", "Suma el stock de todos los almacenes activos.")
  return {
    text: lines.join("\n").trim(),
    kpis: [
      { label: "Agotados", value: String(empty.length), tone: empty.length ? "red" : "green" },
      { label: "Bajo el mínimo", value: String(low.length), tone: low.length ? "gold" : "green" },
      { label: "Productos activos", value: String(products.length), tone: "slate" },
    ],
    links: [{ label: "Alertas de stock", href: "/inventario/alertas" }, { label: "Requerimiento", href: "/compras/requerimiento" }],
  }
}

export async function expiring(ctx: TenantContext, days = 30): Promise<ToolResult> {
  const limit = new Date(Date.now() + days * DAY)
  const lots = await prisma.lot.findMany({
    where: { businessId: ctx.businessId, quantity: { gt: 0 }, expiresAt: { not: null, lte: limit }, product: { isActive: true }, warehouse: { isActive: true } },
    include: { product: { select: { name: true, costPrice: true, baseUnit: { select: { symbol: true } } } }, warehouse: { select: { name: true } } },
    orderBy: { expiresAt: "asc" },
  })
  if (!lots.length) return { text: `No hay productos que venzan en los próximos ${days} días. ✅`, links: [{ label: "Alertas de stock", href: "/inventario/alertas" }] }
  const expired = lots.filter((lot) => lot.expiresAt! < new Date())
  const soon = lots.filter((lot) => lot.expiresAt! >= new Date())
  const showCost = canSeeCost(ctx)
  const fmt = (lot: (typeof lots)[number]) => {
    const d = Math.ceil((lot.expiresAt!.getTime() - Date.now()) / DAY)
    const value = showCost ? ` · ${money(mulScale(lot.product.costPrice, lot.quantity), ctx.currency)} al costo` : ""
    return `- ${lot.product.name}: ${qtyText(lot.quantity)} ${lot.product.baseUnit.symbol} — ${dayText(lot.expiresAt!)} (${d < 0 ? `venció hace ${-d} d` : d === 0 ? "vence hoy" : `${d} d`}) · ${lot.warehouse.name}${value}`
  }
  const lines: string[] = []
  if (expired.length) lines.push(`**Ya vencidos (${expired.length}):**`, ...expired.slice(0, 10).map(fmt), "")
  if (soon.length) lines.push(`**Vencen en los próximos ${days} días (${soon.length}):**`, ...soon.slice(0, 15).map(fmt))
  lines.push("", "Sugerencia: pon adelante lo que vence antes, haz una oferta o regístralo como merma si ya no se puede vender.")
  return {
    text: lines.join("\n").trim(),
    kpis: [
      { label: "Ya vencidos", value: String(expired.length), tone: expired.length ? "red" : "green" },
      { label: `Vencen en ${days} días`, value: String(soon.length), tone: soon.length ? "gold" : "green" },
    ],
    links: [{ label: "Alertas de stock", href: "/inventario/alertas" }, { label: "Mermas", href: "/inventario/conteo?v=mermas" }],
  }
}

/** Productos con stock que no se venden hace N días (capital inmovilizado). */
export async function deadStock(ctx: TenantContext, days = 30): Promise<ToolResult> {
  const since = new Date(Date.now() - days * DAY)
  const [balances, sold] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { businessId: ctx.businessId, quantity: { gt: 0 }, warehouse: { isActive: true }, product: { isActive: true } },
      select: { productId: true, quantity: true, product: { select: { name: true, costPrice: true, baseUnit: { select: { symbol: true } } } } },
    }),
    prisma.saleLine.findMany({
      where: { sale: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: since } } },
      select: { productId: true },
      distinct: ["productId"],
    }),
  ])
  const soldSet = new Set(sold.map((row) => row.productId))
  const map = new Map<string, { name: string; qty: number; value: number; unit: string }>()
  for (const b of balances) {
    if (soldSet.has(b.productId)) continue
    const row = map.get(b.productId) ?? { name: b.product.name, qty: 0, value: 0, unit: b.product.baseUnit.symbol }
    row.qty += b.quantity
    row.value += mulScale(b.product.costPrice, b.quantity)
    map.set(b.productId, row)
  }
  const rows = [...map.values()].sort((a, b) => b.value - a.value)
  if (!rows.length) return { text: `Todos los productos con stock tuvieron ventas en los últimos ${days} días. ✅` }
  const showCost = canSeeCost(ctx)
  const value = rows.reduce((sum, r) => sum + r.value, 0)
  return {
    text: [
      `**Productos sin ventas en los últimos ${days} días (${rows.length})**${showCost ? ` · ${money(value, ctx.currency)} inmovilizados al costo` : ""}:`,
      ...rows.slice(0, 15).map((r) => `- ${r.name}: ${qtyText(r.qty)} ${r.unit}${showCost ? ` · ${money(r.value, ctx.currency)}` : ""}`),
      rows.length > 15 ? `…y ${rows.length - 15} más.` : "",
      "",
      "Ideas: muévelos a un lugar visible, arma packs con productos que sí rotan o deja de reponerlos.",
    ]
      .filter((line, i, all) => line || all[i - 1])
      .join("\n"),
  }
}

/**
 * Qué comprar: ritmo de venta de los últimos 30 días contra el stock actual.
 * Sugiere cubrir 14 días y respeta el stock mínimo y el máximo del producto.
 */
export async function reorderSuggestion(ctx: TenantContext): Promise<ToolResult> {
  const window = 30
  const since = new Date(Date.now() - window * DAY)
  const [products, lines] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: ctx.businessId, isActive: true, variants: { none: {} } },
      select: { id: true, name: true, minStock: true, maxStock: true, costPrice: true, baseUnit: { select: { symbol: true } }, brand: { select: { name: true } }, balances: { where: { warehouse: { isActive: true } }, select: { quantity: true } } },
    }),
    prisma.saleLine.findMany({
      where: { sale: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: since } } },
      select: { productId: true, baseQuantity: true },
    }),
  ])
  const sold = new Map<string, number>()
  for (const line of lines) sold.set(line.productId, (sold.get(line.productId) ?? 0) + line.baseQuantity)
  const rows: { name: string; brand: string; stock: number; perDay: number; daysLeft: number; buy: number; unit: string; cost: number }[] = []
  for (const p of products) {
    const stock = p.balances.reduce((sum, b) => sum + b.quantity, 0)
    const perDay = (sold.get(p.id) ?? 0) / window
    const daysLeft = perDay > 0 ? stock / perDay : Infinity
    const target = Math.max(perDay * 14, p.minStock * 1.5)
    const capped = p.maxStock ? Math.min(target, p.maxStock) : target
    const needs = (perDay > 0 && daysLeft < 7) || (p.minStock > 0 && stock <= p.minStock)
    if (!needs) continue
    const buy = Math.max(0, Math.ceil((capped - stock) / 10_000) * 10_000)
    if (buy <= 0) continue
    rows.push({ name: p.name, brand: p.brand?.name ?? "Sin marca", stock, perDay, daysLeft, buy, unit: p.baseUnit.symbol, cost: mulScale(p.costPrice, buy) })
  }
  if (!rows.length) return { text: "Con el ritmo de venta de los últimos 30 días no hace falta reponer nada urgente. ✅" }
  rows.sort((a, b) => a.daysLeft - b.daysLeft)
  const showCost = canSeeCost(ctx)
  const total = rows.reduce((sum, r) => sum + r.cost, 0)
  return {
    text: [
      `**Sugerencia de compra (${rows.length} productos)** — cubre ~14 días según lo vendido en los últimos 30:`,
      ...rows.slice(0, 15).map((r) => {
        const left = Number.isFinite(r.daysLeft) ? (r.daysLeft < 1 ? "se acaba hoy" : `alcanza ~${Math.floor(r.daysLeft)} d`) : "bajo el mínimo"
        return `- ${r.name} (${r.brand}): pedir **${qtyText(r.buy)} ${r.unit}** · hay ${qtyText(r.stock)}, ${left}${showCost ? ` · ~${money(r.cost, ctx.currency)}` : ""}`
      }),
      rows.length > 15 ? `…y ${rows.length - 15} más.` : "",
      showCost ? `\nInversión estimada al último costo: **${money(total, ctx.currency)}**.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    kpis: [
      { label: "Por reponer", value: String(rows.length), tone: "gold" },
      { label: "Más urgente", value: rows[0].name, hint: Number.isFinite(rows[0].daysLeft) ? `~${Math.floor(rows[0].daysLeft)} día(s) de stock` : "bajo el mínimo", tone: "red" },
      ...(showCost ? [{ label: "Inversión estimada", value: money(total, ctx.currency), tone: "blue" as const }] : []),
    ],
    links: [{ label: "Armar requerimiento", href: "/compras/requerimiento" }],
  }
}

/** Productos vendidos bajo el costo o con margen muy bajo. */
export async function marginAlerts(ctx: TenantContext): Promise<ToolResult> {
  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, isActive: true, costPrice: { gt: 0 }, variants: { none: {} } },
    select: { name: true, costPrice: true, salePrice: true },
  })
  const rows = products
    .map((p) => ({ ...p, margin: p.salePrice ? ((p.salePrice - p.costPrice) / p.salePrice) * 100 : -100 }))
    .filter((p) => p.margin < 10)
    .sort((a, b) => a.margin - b.margin)
  if (!rows.length) return { text: "Ningún producto tiene margen menor al 10 %. ✅" }
  const below = rows.filter((r) => r.salePrice < r.costPrice).length
  return {
    text: [
      `**Productos con margen menor al 10 % (${rows.length})**${below ? ` — ⚠️ ${below} se venden bajo el costo` : ""}:`,
      ...rows.slice(0, 15).map((r) => `- ${r.name}: costo ${money(r.costPrice, ctx.currency)} · venta ${money(r.salePrice, ctx.currency)} · margen ${r.margin.toFixed(1)} %`),
      "",
      "Revisa si el costo subió en la última compra (Recepción puede actualizar el precio de venta).",
    ].join("\n"),
    links: [{ label: "Productos y marcas", href: "/productos" }],
  }
}

export async function inventoryValueReport(ctx: TenantContext): Promise<ToolResult> {
  const balances = await prisma.stockBalance.findMany({
    where: { businessId: ctx.businessId, quantity: { gt: 0 }, warehouse: { isActive: true } },
    select: { quantity: true, warehouse: { select: { name: true } }, product: { select: { costPrice: true, salePrice: true, isActive: true } } },
  })
  const per = new Map<string, { cost: number; sale: number; items: number }>()
  for (const b of balances) {
    if (!b.product.isActive) continue
    const row = per.get(b.warehouse.name) ?? { cost: 0, sale: 0, items: 0 }
    row.cost += mulScale(b.product.costPrice, b.quantity)
    row.sale += mulScale(b.product.salePrice, b.quantity)
    row.items += 1
    per.set(b.warehouse.name, row)
  }
  const total = [...per.values()].reduce((acc, r) => ({ cost: acc.cost + r.cost, sale: acc.sale + r.sale }), { cost: 0, sale: 0 })
  return {
    text: [
      `**Valor del inventario:** ${money(total.cost, ctx.currency)} al costo · ${money(total.sale, ctx.currency)} a precio de venta (ganancia potencial ${money(total.sale - total.cost, ctx.currency)}).`,
      ...[...per.entries()].map(([name, r]) => `- ${name}: ${money(r.cost, ctx.currency)} al costo · ${r.items} producto(s) con stock`),
    ].join("\n"),
    kpis: [
      { label: "Al costo", value: money(total.cost, ctx.currency), tone: "blue" },
      { label: "A precio de venta", value: money(total.sale, ctx.currency), tone: "gold" },
      { label: "Ganancia potencial", value: money(total.sale - total.cost, ctx.currency), tone: total.sale >= total.cost ? "green" : "red" },
    ],
    links: [{ label: "Almacenes", href: "/inventario/almacenes" }],
  }
}

export async function lossesReport(ctx: TenantContext, period: Period): Promise<ToolResult> {
  const losses = await prisma.stockLoss.findMany({
    where: { businessId: ctx.businessId, status: "ACTIVE", createdAt: { gte: period.from, lte: period.to } },
    select: { totalCost: true, type: true, cause: true, product: { select: { name: true } } },
  })
  if (!losses.length) return { text: `No hay mermas ni pérdidas registradas ${period.label}.` }
  const total = losses.reduce((sum, l) => sum + l.totalCost, 0)
  const byProduct = new Map<string, number>()
  for (const l of losses) byProduct.set(l.product.name, (byProduct.get(l.product.name) ?? 0) + l.totalCost)
  return {
    text: [
      `**Mermas y pérdidas ${period.label}:** ${money(total, ctx.currency)} en ${losses.length} registro(s).`,
      ...[...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, cost]) => `- ${name}: ${money(cost, ctx.currency)}`),
    ].join("\n"),
    links: [{ label: "Mermas y pérdidas", href: "/inventario/conteo?v=mermas" }],
  }
}

/* ───────────────────────── Caja ───────────────────────── */

export async function cashStatus(ctx: TenantContext): Promise<ToolResult> {
  const full = hasFullCashAccess(ctx)
  const membership = await prisma.membership.findUnique({ where: { userId_businessId: { userId: ctx.userId, businessId: ctx.businessId } } })
  const sessions = await prisma.cashSession.findMany({
    where: {
      businessId: ctx.businessId,
      status: "OPEN",
      ...(full ? {} : membership?.cashRegisterId ? { cashRegisterId: membership.cashRegisterId } : { userId: ctx.userId }),
    },
    include: { register: true, user: true },
  })
  if (!sessions.length) {
    return { text: full ? "No hay ninguna caja abierta en este momento." : "Tu caja está cerrada. Ábrela desde Caja para empezar a vender.", links: [{ label: "Ir a Caja", href: "/ventas" }] }
  }
  const blocks: string[] = []
  for (const s of sessions) {
    const summary = await summarizeSession(ctx, s.id)
    const methods = Object.entries(summary.byMethod).filter(([, v]) => v)
    blocks.push(
      [
        `**${s.register.name}** — abierta por ${s.user.name} el ${dayText(s.openedAt)} a las ${s.openedAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`,
        `Apertura ${money(s.openingAmount, ctx.currency)} · ingresos ${money(summary.income, ctx.currency)} · egresos ${money(summary.expense, ctx.currency)}`,
        methods.length ? `Cobrado: ${methods.map(([m, v]) => `${PAYMENT_LABEL[m] ?? m} ${money(v, ctx.currency)}`).join(" · ")}` : "Aún sin cobros en este turno.",
        `Efectivo esperado en caja: **${money(summary.expected, ctx.currency)}**`,
      ].join("\n"),
    )
  }
  const expectedTotal = (await Promise.all(sessions.map((s) => summarizeSession(ctx, s.id)))).reduce((sum, r) => sum + r.expected, 0)
  return {
    text: blocks.join("\n\n"),
    kpis: [
      { label: "Cajas abiertas", value: String(sessions.length), tone: "blue" },
      { label: "Efectivo esperado", value: money(expectedTotal, ctx.currency), tone: "green" },
    ],
    links: can(ctx.role, "cashClose", ctx.grants) ? [{ label: "Cierre de caja", href: "/caja/cierre" }] : undefined,
  }
}

export async function cashMovements(ctx: TenantContext, period: Period): Promise<ToolResult> {
  const moves = await prisma.cashMovement.findMany({
    where: { businessId: ctx.businessId, createdAt: { gte: period.from, lte: period.to }, ...(hasFullCashAccess(ctx) || canReports(ctx) ? {} : { userId: ctx.userId }) },
    orderBy: { createdAt: "desc" },
  })
  if (!moves.length) return { text: `No hay ingresos ni egresos de caja ${period.label}.` }
  const income = moves.filter((m) => m.type === "INCOME" || m.type === "DEPOSIT").reduce((s, m) => s + m.amount, 0)
  const expense = moves.filter((m) => m.type === "EXPENSE" || m.type === "WITHDRAWAL").reduce((s, m) => s + m.amount, 0)
  return {
    text: [
      `**Movimientos de caja ${period.label}:** ingresos ${money(income, ctx.currency)} · egresos ${money(expense, ctx.currency)}.`,
      ...moves.slice(0, 10).map((m) => `- ${m.type === "INCOME" || m.type === "DEPOSIT" ? "＋" : "－"} ${money(m.amount, ctx.currency)} · ${m.reason} (${dayText(m.createdAt)})`),
    ].join("\n"),
  }
}

/* ───────────────────────── Compras y proveedores ───────────────────────── */

export async function payables(ctx: TenantContext): Promise<ToolResult> {
  const purchases = await prisma.purchase.findMany({
    where: { businessId: ctx.businessId, status: { not: "CANCELLED" } },
    select: { total: true, paid: true, createdAt: true, documentNumber: true, supplier: { select: { tradeName: true, paymentTerm: true, creditDays: true } } },
  })
  const open = purchases.filter((p) => p.total - p.paid > 0)
  if (!open.length) return { text: "No hay deudas pendientes con proveedores. ✅" }
  const bySupplier = new Map<string, { debt: number; oldest: Date; overdue: number }>()
  for (const p of open) {
    const row = bySupplier.get(p.supplier.tradeName) ?? { debt: 0, oldest: p.createdAt, overdue: 0 }
    row.debt += p.total - p.paid
    if (p.createdAt < row.oldest) row.oldest = p.createdAt
    const due = new Date(p.createdAt.getTime() + (p.supplier.creditDays ?? 0) * DAY)
    if (due < new Date()) row.overdue += p.total - p.paid
    bySupplier.set(p.supplier.tradeName, row)
  }
  const total = open.reduce((s, p) => s + p.total - p.paid, 0)
  return {
    text: [
      `**Por pagar a proveedores:** ${money(total, ctx.currency)} en ${open.length} compra(s).`,
      ...[...bySupplier.entries()]
        .sort((a, b) => b[1].debt - a[1].debt)
        .map(([name, r]) => `- ${name}: ${money(r.debt, ctx.currency)} (desde ${dayText(r.oldest)})${r.overdue ? ` · ⚠️ vencido ${money(r.overdue, ctx.currency)}` : ""}`),
    ].join("\n"),
    kpis: [
      { label: "Por pagar", value: money(total, ctx.currency), tone: "gold" },
      { label: "Compras pendientes", value: String(open.length), tone: "slate" },
      { label: "Vencido", value: money([...bySupplier.values()].reduce((s, r) => s + r.overdue, 0), ctx.currency), tone: [...bySupplier.values()].some((r) => r.overdue) ? "red" : "green" },
    ],
    links: [{ label: "Pago pendiente", href: "/compras/por-pagar" }],
  }
}

export async function purchasesSummary(ctx: TenantContext, period: Period): Promise<ToolResult> {
  const [inPeriod, pending] = await Promise.all([
    prisma.purchase.findMany({
      where: { businessId: ctx.businessId, status: { not: "CANCELLED" }, createdAt: { gte: period.from, lte: period.to } },
      select: { total: true, supplier: { select: { tradeName: true } } },
    }),
    prisma.purchase.findMany({
      where: { businessId: ctx.businessId, status: { in: ["ORDERED", "PARTIAL"] } },
      select: { status: true, total: true, createdAt: true, supplier: { select: { tradeName: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ])
  const total = inPeriod.reduce((s, p) => s + p.total, 0)
  const bySupplier = new Map<string, number>()
  for (const p of inPeriod) bySupplier.set(p.supplier.tradeName, (bySupplier.get(p.supplier.tradeName) ?? 0) + p.total)
  const lines = [`**Compras ${period.label}:** ${money(total, ctx.currency)} en ${inPeriod.length} compra(s).`]
  if (bySupplier.size) lines.push(...[...bySupplier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, t]) => `- ${name}: ${money(t, ctx.currency)}`))
  if (pending.length) {
    lines.push("", `**Pendientes de recibir (${pending.length}):**`, ...pending.slice(0, 6).map((p) => `- ${p.supplier.tradeName}: ${money(p.total, ctx.currency)} · ${PURCHASE_LABEL[p.status] ?? p.status} desde ${dayText(p.createdAt)}`))
  }
  return { text: lines.join("\n"), links: [{ label: "Historial de compras", href: "/compras/historial" }] }
}

export async function suppliersList(ctx: TenantContext, terms: string[]): Promise<ToolResult> {
  const suppliers = await prisma.supplier.findMany({
    where: { businessId: ctx.businessId, isActive: true },
    select: { tradeName: true, taxId: true, phone: true, contact: true, paymentTerm: true, creditDays: true, _count: { select: { purchases: true } } },
    orderBy: { tradeName: "asc" },
  })
  const filtered = terms.length ? suppliers.filter((s) => terms.some((t) => fold(s.tradeName).includes(fold(t)))) : suppliers
  const rows = filtered.length ? filtered : suppliers
  if (!rows.length) return { text: "Aún no hay proveedores registrados.", links: [{ label: "Proveedores", href: "/compras/proveedores" }] }
  return {
    text: [
      `**Proveedores (${rows.length}):**`,
      ...rows.slice(0, 15).map((s) => `- ${s.tradeName}${s.taxId ? ` · RUC ${s.taxId}` : ""}${s.phone ? ` · ☎ ${s.phone}` : ""}${s.contact ? ` · ${s.contact}` : ""} · ${s.paymentTerm === "CREDITO" ? `crédito ${s.creditDays ?? 0} d` : "contado"} · ${s._count.purchases} compra(s)`),
    ].join("\n"),
    links: [{ label: "Proveedores", href: "/compras/proveedores" }],
  }
}

/* ───────────────────────── Clientes ───────────────────────── */

export async function receivables(ctx: TenantContext): Promise<ToolResult> {
  const customers = await prisma.customer.findMany({
    where: { businessId: ctx.businessId, balance: { gt: 0 } },
    select: { name: true, balance: true, creditLimit: true, phone: true },
    orderBy: { balance: "desc" },
  })
  if (!customers.length) return { text: "Ningún cliente tiene deuda pendiente. ✅" }
  const total = customers.reduce((s, c) => s + c.balance, 0)
  return {
    text: [
      `**Cuentas por cobrar:** ${money(total, ctx.currency)} de ${customers.length} cliente(s).`,
      ...customers.slice(0, 15).map((c) => `- ${c.name}: ${money(c.balance, ctx.currency)}${c.creditLimit && c.balance > c.creditLimit ? " ⚠️ supera su límite" : ""}${c.phone ? ` · ☎ ${c.phone}` : ""}`),
    ].join("\n"),
    kpis: [
      { label: "Por cobrar", value: money(total, ctx.currency), tone: "gold" },
      { label: "Clientes con deuda", value: String(customers.length), tone: "slate" },
      { label: "Mayor deuda", value: customers[0].name, hint: money(customers[0].balance, ctx.currency), tone: "red" },
    ],
    links: [{ label: "Cuentas pendientes", href: "/ventas" }, { label: "Clientes", href: "/clientes" }],
  }
}

export async function topCustomers(ctx: TenantContext, period: Period): Promise<ToolResult> {
  const report = await salesReport(ctx, { from: period.from, to: period.to })
  const rows = report.byCustomer.filter(([key]) => key !== "publico").map(([, r]) => r).sort((a, b) => b.total - a.total)
  if (!rows.length) return { text: `No hay ventas a clientes registrados ${period.label} (todas fueron a público general).` }
  return {
    text: [`**Mejores clientes ${period.label}:**`, ...rows.slice(0, 10).map((r, i) => `${i + 1}. ${r.name} — ${money(r.total, ctx.currency)} en ${r.count} compra(s)`)].join("\n"),
    links: [{ label: "Historial de clientes", href: "/clientes/historial" }],
  }
}

export async function customerInfo(ctx: TenantContext, terms: string[]): Promise<ToolResult | null> {
  if (!terms.length) return null
  const customers = await prisma.customer.findMany({ where: { businessId: ctx.businessId, isActive: true }, select: { id: true, name: true, document: true, phone: true, balance: true, creditLimit: true } })
  const found = customers.filter((c) => terms.every((t) => fold(`${c.name} ${c.document ?? ""}`).includes(fold(t))))
  if (!found.length) return null
  const blocks = await Promise.all(
    found.slice(0, 3).map(async (c) => {
      const last = await prisma.sale.findFirst({ where: { businessId: ctx.businessId, customerId: c.id, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, total: true } })
      return [
        `**${c.name}**${c.document ? ` · ${c.document}` : ""}${c.phone ? ` · ☎ ${c.phone}` : ""}`,
        `Deuda: **${money(c.balance, ctx.currency)}**${c.creditLimit ? ` · límite ${money(c.creditLimit, ctx.currency)}` : ""}`,
        last ? `Última compra: ${dayText(last.createdAt)} por ${money(last.total, ctx.currency)}` : "Sin compras registradas.",
      ].join("\n")
    }),
  )
  return { text: blocks.join("\n\n"), links: [{ label: "Clientes", href: "/clientes" }] }
}

/* ───────────────────────── Facturación ───────────────────────── */

export async function billingStatus(ctx: TenantContext, period: Period): Promise<ToolResult> {
  const docs = await prisma.electronicDocument.findMany({
    where: { businessId: ctx.businessId, issuedAt: { gte: period.from, lte: period.to } },
    select: { docType: true, status: true, total: true },
  })
  const pendingAll = await prisma.electronicDocument.count({ where: { businessId: ctx.businessId, status: { in: ["QUEUED", "ERROR", "REJECTED"] } } })
  if (!docs.length && !pendingAll) return { text: `No hay comprobantes electrónicos ${period.label}.`, links: [{ label: "Comprobantes", href: "/facturacion" }] }
  const LABEL: Record<string, string> = { QUEUED: "en cola", SENT: "enviados", ACCEPTED: "aceptados", REJECTED: "rechazados", ERROR: "con error" }
  const byStatus = new Map<string, number>()
  const byType = new Map<string, { count: number; total: number }>()
  for (const d of docs) {
    byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1)
    const row = byType.get(d.docType) ?? { count: 0, total: 0 }
    row.count += 1
    row.total += d.total
    byType.set(d.docType, row)
  }
  return {
    text: [
      `**Comprobantes ${period.label}:** ${docs.length}`,
      ...[...byType.entries()].map(([type, r]) => `- ${type.charAt(0) + type.slice(1).toLowerCase()}: ${r.count} · ${money(r.total, ctx.currency)}`),
      byStatus.size ? `Estados: ${[...byStatus.entries()].map(([s, n]) => `${n} ${LABEL[s] ?? s}`).join(" · ")}` : "",
      pendingAll ? `\n⚠️ Hay ${pendingAll} comprobante(s) en cola, con error o rechazados en total. Revísalos y usa Reintentar.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    links: [{ label: "Comprobantes", href: "/facturacion" }],
  }
}

/* ───────────────────────── Resumen del negocio ───────────────────────── */

/** «¿Cómo va el negocio?»: ventas de hoy, caja, alertas y pendientes, según lo que el rol puede ver. */
export async function briefing(ctx: TenantContext, period: Period): Promise<ToolResult> {
  const parts: string[] = []
  const sales = await salesSummary(ctx, period)
  parts.push(sales.text.split("\n\nPor método de pago")[0])
  const alerts: string[] = []
  const [lowCount, emptyCount, expSoon] = await Promise.all([
    prisma.product.findMany({ where: { businessId: ctx.businessId, isActive: true, minStock: { gt: 0 }, variants: { none: {} } }, select: { minStock: true, balances: { where: { warehouse: { isActive: true } }, select: { quantity: true } } } }).then(
      (rows) => rows.filter((p) => {
        const q = p.balances.reduce((s, b) => s + b.quantity, 0)
        return q > 0 && q <= p.minStock
      }).length,
    ),
    prisma.product.findMany({ where: { businessId: ctx.businessId, isActive: true, variants: { none: {} } }, select: { balances: { where: { warehouse: { isActive: true } }, select: { quantity: true } } } }).then(
      (rows) => rows.filter((p) => p.balances.reduce((s, b) => s + b.quantity, 0) <= 0).length,
    ),
    prisma.lot.count({ where: { businessId: ctx.businessId, quantity: { gt: 0 }, expiresAt: { not: null, lte: new Date(Date.now() + 15 * DAY) }, product: { isActive: true } } }),
  ])
  if (lowCount) alerts.push(`${lowCount} producto(s) bajo el mínimo`)
  if (emptyCount) alerts.push(`${emptyCount} agotado(s)`)
  if (expSoon) alerts.push(`${expSoon} lote(s) vencen en 15 días o menos`)
  if (can(ctx.role, "customers", ctx.grants)) {
    const agg = await prisma.customer.aggregate({ where: { businessId: ctx.businessId, balance: { gt: 0 } }, _sum: { balance: true }, _count: true })
    if (agg._count) alerts.push(`${money(agg._sum.balance ?? 0, ctx.currency)} por cobrar a ${agg._count} cliente(s)`)
  }
  if (can(ctx.role, "purchases", ctx.grants)) {
    const rows = await prisma.purchase.findMany({ where: { businessId: ctx.businessId, status: { not: "CANCELLED" } }, select: { total: true, paid: true } })
    const debt = rows.reduce((s, p) => s + Math.max(0, p.total - p.paid), 0)
    if (debt) alerts.push(`${money(debt, ctx.currency)} por pagar a proveedores`)
  }
  if (can(ctx.role, "cash", ctx.grants)) {
    const open = await prisma.cashSession.count({ where: { businessId: ctx.businessId, status: "OPEN" } })
    parts.push(`Cajas abiertas: ${open}.`)
  }
  parts.push("", alerts.length ? `**Esto necesita tu atención:**\n${alerts.map((a) => `- ${a}`).join("\n")}` : "Todo en orden por ahora. ✅")
  return { text: parts.join("\n"), kpis: [...(sales.kpis ?? [{ label: "Ventas", value: money(0, ctx.currency), hint: "aún sin ventas", tone: "slate" as const }]).slice(0, 2), { label: "Bajo mínimo / agotados", value: `${lowCount} / ${emptyCount}`, tone: lowCount + emptyCount ? "red" : "green" }, { label: "Vencen en 15 días", value: String(expSoon), tone: expSoon ? "gold" : "green" }], links: [{ label: "Panel principal", href: "/" }] }
}
