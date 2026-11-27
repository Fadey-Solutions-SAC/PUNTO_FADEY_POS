/**
 * PIX consultor: responde como un experto en negocios comerciales (bodegas y minimarkets en Perú),
 * siempre apoyado en los números del propio negocio.
 * - `metrics`: indicadores de los últimos 30 días (con caché de 5 minutos por negocio).
 * - `productInsight`: ficha experta de un producto (datos propios + mercado + web) con recomendaciones.
 * - `growthPlan`: diagnóstico del negocio y plan de 30-60-90 días para crecer.
 * - `expertTopic`: temas de gestión (precios, surtido, exhibición, promociones, fidelización, caja…) con los datos del negocio.
 * Los rangos de referencia del sector son orientativos y se presentan así.
 */
import { prisma } from "@/lib/db"
import { mulScale } from "@/lib/money"
import { can } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"
import { searchProducts, type Kpi, type Link } from "@/lib/pix/data"
import { foodFactsByName, sizeNorm, supermarketPrices, wikipediaSummary } from "@/lib/pix/external"
import { fold, money, pct, qtyText } from "@/lib/pix/text"

const DAY = 24 * 60 * 60 * 1000
const DOWS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

export type AdvisorReply = { text: string; links: Link[]; kpis?: Kpi[] }

/* ───────────── Indicadores del negocio ───────────── */

type ProductStat = { id: string; name: string; brand: string; qty: number; total: number; cost: number; tickets: number }

export type Metrics = {
  sales: number
  prevSales: number
  count: number
  prevCount: number
  ticket: number
  itemsPerTicket: number
  grossMargin: number
  cost: number
  products: ProductStat[]
  activeProducts: number
  soldProducts: number
  top20Share: number
  stockoutsSelling: string[]
  deadValue: number
  inventoryValue: number
  receivables: number
  payables: number
  losses: number
  registeredShare: number
  digitalShare: number
  creditShare: number
  bestHour: number | null
  weakDay: number | null
  bestDay: number | null
  dailyAvg: number
}

const CACHE = new Map<string, { at: number; value: Metrics }>()

export async function metrics(ctx: TenantContext): Promise<Metrics> {
  const hit = CACHE.get(ctx.businessId)
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.value
  const now = new Date()
  const from = new Date(now.getTime() - 30 * DAY)
  const prevFrom = new Date(now.getTime() - 60 * DAY)
  const [sales, prev, returns, activeProducts, balances, customers, purchases, losses] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: from } },
      select: {
        total: true,
        createdAt: true,
        customerId: true,
        payments: { select: { method: true, amount: true } },
        lines: { select: { productId: true, quantity: true, baseQuantity: true, costPrice: true, total: true, product: { select: { name: true, brand: { select: { name: true } } } } } },
      },
    }),
    prisma.sale.aggregate({ where: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: prevFrom, lt: from } }, _sum: { total: true }, _count: true }),
    prisma.saleReturn.aggregate({ where: { businessId: ctx.businessId, createdAt: { gte: from } }, _sum: { total: true } }),
    prisma.product.count({ where: { businessId: ctx.businessId, isActive: true, variants: { none: {} } } }),
    prisma.stockBalance.findMany({
      where: { businessId: ctx.businessId, warehouse: { isActive: true }, product: { isActive: true } },
      select: { productId: true, quantity: true, product: { select: { name: true, costPrice: true } } },
    }),
    prisma.customer.aggregate({ where: { businessId: ctx.businessId, balance: { gt: 0 } }, _sum: { balance: true } }),
    prisma.purchase.findMany({ where: { businessId: ctx.businessId, status: { not: "CANCELLED" } }, select: { total: true, paid: true } }),
    prisma.stockLoss.aggregate({ where: { businessId: ctx.businessId, status: "ACTIVE", createdAt: { gte: from } }, _sum: { totalCost: true } }),
  ])
  const byProduct = new Map<string, ProductStat>()
  const byHour = new Map<number, number>()
  const byDow = new Map<number, number>()
  let gross = 0
  let cost = 0
  let lines = 0
  let registered = 0
  let digital = 0
  let credit = 0
  let paid = 0
  for (const sale of sales) {
    gross += sale.total
    if (sale.customerId) registered += sale.total
    byHour.set(sale.createdAt.getHours(), (byHour.get(sale.createdAt.getHours()) ?? 0) + sale.total)
    byDow.set(sale.createdAt.getDay(), (byDow.get(sale.createdAt.getDay()) ?? 0) + sale.total)
    for (const p of sale.payments) {
      paid += p.amount
      if (p.method === "CARD" || p.method === "TRANSFER") digital += p.amount
      if (p.method === "CREDIT") credit += p.amount
    }
    const seen = new Set<string>()
    for (const line of sale.lines) {
      lines += 1
      const lineCost = mulScale(line.costPrice, line.baseQuantity)
      cost += lineCost
      const row = byProduct.get(line.productId) ?? { id: line.productId, name: line.product.name, brand: line.product.brand?.name ?? "Sin marca", qty: 0, total: 0, cost: 0, tickets: 0 }
      row.qty += line.quantity
      row.total += line.total
      row.cost += lineCost
      if (!seen.has(line.productId)) row.tickets += 1
      seen.add(line.productId)
      byProduct.set(line.productId, row)
    }
  }
  const net = gross - (returns._sum.total ?? 0)
  const products = [...byProduct.values()].sort((a, b) => b.total - a.total)
  const top = Math.max(1, Math.ceil(products.length * 0.2))
  const top20 = products.slice(0, top).reduce((s, p) => s + p.total, 0)
  const lineSum = products.reduce((s, p) => s + p.total, 0)

  const stockByProduct = new Map<string, number>()
  let inventoryValue = 0
  let deadValue = 0
  for (const b of balances) {
    stockByProduct.set(b.productId, (stockByProduct.get(b.productId) ?? 0) + b.quantity)
    if (b.quantity > 0) {
      const value = mulScale(b.product.costPrice, b.quantity)
      inventoryValue += value
      if (!byProduct.has(b.productId)) deadValue += value
    }
  }
  const stockoutsSelling = products.filter((p) => (stockByProduct.get(p.id) ?? 0) <= 0).map((p) => p.name)
  const pick = (map: Map<number, number>, best: boolean) => {
    const entries = [...map.entries()]
    if (!entries.length) return null
    entries.sort((a, b) => (best ? b[1] - a[1] : a[1] - b[1]))
    return entries[0][0]
  }
  const value: Metrics = {
    sales: net,
    prevSales: prev._sum.total ?? 0,
    count: sales.length,
    prevCount: prev._count,
    ticket: sales.length ? Math.round(net / sales.length) : 0,
    itemsPerTicket: sales.length ? lines / sales.length : 0,
    grossMargin: net > 0 ? ((net - cost) / net) * 100 : 0,
    cost,
    products,
    activeProducts,
    soldProducts: products.length,
    top20Share: lineSum ? (top20 / lineSum) * 100 : 0,
    stockoutsSelling,
    deadValue,
    inventoryValue,
    receivables: customers._sum.balance ?? 0,
    payables: purchases.reduce((s, p) => s + Math.max(0, p.total - p.paid), 0),
    losses: losses._sum.totalCost ?? 0,
    registeredShare: gross ? (registered / gross) * 100 : 0,
    digitalShare: paid ? (digital / paid) * 100 : 0,
    creditShare: paid ? (credit / paid) * 100 : 0,
    bestHour: pick(byHour, true),
    weakDay: byDow.size >= 4 ? pick(byDow, false) : null,
    bestDay: byDow.size >= 4 ? pick(byDow, true) : null,
    dailyAvg: Math.round(net / 30),
  }
  CACHE.set(ctx.businessId, { at: Date.now(), value })
  return value
}

const fin = (ctx: TenantContext) => can(ctx.role, "reports", ctx.grants)

/* ───────────── Ficha experta de un producto ───────────── */

/** Palabra genérica del producto para buscar en Wikipedia («ARROZ EXTRA COSTEÑO 5KG» → «arroz»). */
function genericTerm(name: string) {
  const words = fold(name).split(" ").filter((w) => w.length > 2 && !/\d/.test(w))
  return words[0] ?? ""
}

export async function productInsight(ctx: TenantContext, productId: string): Promise<AdvisorReply> {
  const product = await prisma.product.findFirstOrThrow({
    where: { id: productId, businessId: ctx.businessId },
    include: { brand: true, baseUnit: true, balances: { where: { warehouse: { isActive: true } } } },
  })
  const m = await metrics(ctx)
  const showMoney = fin(ctx) || can(ctx.role, "priceWrite", ctx.grants)
  const now = Date.now()
  const [recent, before, together, lastPurchase] = await Promise.all([
    prisma.saleLine.aggregate({ where: { productId, sale: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: new Date(now - 30 * DAY) } } }, _sum: { baseQuantity: true, total: true }, _count: true }),
    prisma.saleLine.aggregate({ where: { productId, sale: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: new Date(now - 60 * DAY), lt: new Date(now - 30 * DAY) } } }, _sum: { baseQuantity: true } }),
    // Productos que se llevan en la misma venta (para combos y exhibición cruzada).
    prisma.saleLine.findMany({
      where: { productId: { not: productId }, sale: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: new Date(now - 90 * DAY) }, lines: { some: { productId } } } },
      select: { productId: true, product: { select: { name: true } } },
    }),
    prisma.purchaseLine.findFirst({ where: { productId, purchase: { businessId: ctx.businessId, status: { not: "CANCELLED" } } }, orderBy: { purchase: { createdAt: "desc" } }, include: { purchase: { include: { supplier: true } } } }).catch(() => null),
  ])
  const sold30 = recent._sum.baseQuantity ?? 0
  const sold60 = before._sum.baseQuantity ?? 0
  const stock = product.balances.reduce((s, b) => s + b.quantity, 0)
  const perDay = sold30 / 30
  const coverDays = perDay > 0 ? stock / perDay : Infinity
  const margin = product.salePrice ? ((product.salePrice - product.costPrice) / product.salePrice) * 100 : 0
  const rank = m.products.findIndex((p) => p.id === productId)
  const abc = rank < 0 ? null : (() => {
    const total = m.products.reduce((s, p) => s + p.total, 0)
    let acc = 0
    for (let i = 0; i < rank; i++) acc += m.products[i].total
    const share = total ? (acc / total) * 100 : 100
    // Clasificación ABC por la venta acumulada antes de este producto.
    return share < 80 ? "A" : share < 95 ? "B" : "C"
  })()

  const unit = product.baseUnit.symbol
  const lines: string[] = [`Esto es lo que sé de **${product.name}**${product.brand ? ` (${product.brand.name})` : ""} 👇`]

  // 1. Desempeño en tu tienda.
  lines.push("", "**📊 Cómo le va en tu tienda (últimos 30 días)**")
  if (sold30 > 0) {
    const trend = sold60 > 0 ? ((sold30 - sold60) / sold60) * 100 : null
    lines.push(`- Vendiste ${qtyText(sold30)} ${unit} en ${recent._count} venta(s)${showMoney ? ` · ${money(recent._sum.total ?? 0, ctx.currency)}` : ""}${trend != null ? ` · ${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend).toFixed(0)} % frente a los 30 días anteriores` : ""}.`)
    if (rank >= 0) lines.push(`- Puesto ${rank + 1} de ${m.products.length} en ventas · categoría **${abc}** (${abc === "A" ? "de los que más dinero traen: nunca debe faltar" : abc === "B" ? "importante, vigílalo" : "aporta poco: revisa si vale la pena el espacio"}).`)
  } else {
    lines.push("- Sin ventas en los últimos 30 días.")
  }
  lines.push(`- Stock: ${qtyText(stock)} ${unit}${Number.isFinite(coverDays) ? ` · alcanza para ~${Math.max(0, Math.floor(coverDays))} día(s)` : ""}${product.minStock ? ` · mínimo ${qtyText(product.minStock)}` : ""}.`)
  if (showMoney) lines.push(`- Precio ${money(product.salePrice, ctx.currency)} · costo ${money(product.costPrice, ctx.currency)} · margen **${margin.toFixed(1)} %**.`)
  else lines.push(`- Precio de venta: ${money(product.salePrice, ctx.currency)}.`)
  if (lastPurchase && can(ctx.role, "purchases", ctx.grants)) lines.push(`- Última compra: ${lastPurchase.purchase.supplier.tradeName}, ${lastPurchase.purchase.createdAt.toLocaleDateString("es-PE")}.`)
  const pairs = new Map<string, { name: string; n: number }>()
  for (const t of together) pairs.set(t.productId, { name: t.product.name, n: (pairs.get(t.productId)?.n ?? 0) + 1 })
  const topPairs = [...pairs.values()].sort((a, b) => b.n - a.n).slice(0, 3)
  if (topPairs.length) lines.push(`- Se lleva junto con: ${topPairs.map((p) => `${p.name} (${p.n})`).join(", ")}.`)

  // 2. Mercado y web (en paralelo; si una fuente falla, se omite).
  const sizeHint = sizeNorm(product.name).split(" ").find((w) => /^\d+(?:\.\d+)?(?:l|kg|g|ml)$/.test(w))
  const query = `${product.brand && !fold(product.name).includes(fold(product.brand.name)) ? product.brand.name : ""} ${product.name}`.trim()
  const [market, off, wiki] = await Promise.all([
    supermarketPrices(query).catch(() => null),
    foodFactsByName(query).catch(() => null),
    wikipediaSummary(genericTerm(product.name)).catch(() => null),
  ])
  const marketRows = market?.results ?? []
  lines.push("", "**🛒 Cómo está el mercado (Plaza Vea, Wong, Metro)**")
  if (marketRows.length) {
    const prices = marketRows.map((r) => r.price).sort((a, b) => a - b)
    const mid = prices[Math.floor(prices.length / 2)]
    lines.push(`- ${marketRows.slice(0, 3).map((r) => `${r.store}: ${r.name} S/ ${r.price.toFixed(2)}`).join(" · ")}`)
    if (market?.exact || sizeHint) {
      const diff = ((product.salePrice / 100 - mid) / mid) * 100
      lines.push(`- Tu precio está ${Math.abs(diff) < 2 ? "en línea con" : `${Math.abs(diff).toFixed(0)} % ${diff > 0 ? "por encima de" : "por debajo de"}`} la mediana del supermercado (S/ ${mid.toFixed(2)}).`)
    } else lines.push("- (Revisa que sea la misma presentación antes de comparar.)")
  } else lines.push("- No lo encontré en las tiendas web (puede ser un producto local o de otra presentación).")

  if (off || wiki) {
    lines.push("", "**🌐 Lo que dice la red**")
    if (wiki) lines.push(`- ${wiki.extract} _(Wikipedia)_`)
    if (off) lines.push(`- Open Food Facts: ${off.name}${off.brand ? ` · ${off.brand}` : ""}${off.quantity ? ` · ${off.quantity}` : ""}${off.nutriscore ? ` · Nutri-Score ${off.nutriscore}` : ""}${off.categories ? ` · ${off.categories}` : ""}.`)
  }

  // 3. Recomendaciones del experto.
  const tips: string[] = []
  if (sold30 > 0 && stock <= 0) tips.push("Está **agotado y se vende**: cada día sin stock es venta perdida (y el cliente se va a la competencia). Repón hoy mismo.")
  else if (Number.isFinite(coverDays) && coverDays < 5) tips.push(`Te alcanza para ${Math.floor(coverDays)} día(s): pide ahora; lo ideal para un producto que rota es tener 7–14 días de cobertura.`)
  else if (coverDays > 60 && sold30 > 0) tips.push(`Tienes stock para más de 2 meses: estás inmovilizando dinero. Compra menos y más seguido, o empújalo con una oferta.`)
  if (sold30 === 0 && stock > 0) tips.push("No rota: muévelo a la altura de los ojos o cerca de la caja, arma un combo con un producto estrella o deja de reponerlo.")
  if (showMoney && product.costPrice > 0) {
    if (product.salePrice < product.costPrice) tips.push("**Lo vendes por debajo del costo.** Revisa el último costo de compra y actualiza el precio.")
    else if (margin < 10 && abc !== "A") tips.push("Margen muy bajo para un producto que no es gancho: súbelo unos céntimos o negocia mejor costo con el proveedor.")
    else if (margin < 10 && abc === "A") tips.push("Es un producto «gancho» (atrae clientes) con margen bajo: está bien si lo compensas con productos de mayor margen al lado.")
    else if (margin > 45 && marketRows.length && !(market?.exact || sizeHint)) tips.push("Margen alto: confirma que tu precio sigue siendo competitivo frente al mercado.")
  }
  if (topPairs.length) tips.push(`Exhíbelo cerca de ${topPairs[0].name} o arma un combo con ese producto: ya se compran juntos.`)
  if (abc === "A") tips.push("Al ser de categoría A: nunca debe faltar, ten un stock mínimo de seguridad y un segundo proveedor por si falla el primero.")
  if (!tips.length) tips.push("¡Va muy bien! Solo vigila su precio frente al mercado y que el stock no baje del mínimo.")
  lines.push("", "**💡 Lo que yo haría en tu lugar**", ...tips.map((t, i) => `${i + 1}. ${t}`))
  if (wiki) lines.push("", `_Fuentes: datos de tu tienda; precios publicados hoy en tiendas web; Wikipedia (${wiki.url.replace("https://", "")})${off ? "; Open Food Facts" : ""}._`)

  const links: Link[] = [{ label: "Ver producto", href: `/productos/${product.id}` }]
  if (stock <= 0 || coverDays < 7) links.push({ label: "Armar requerimiento", href: "/compras/requerimiento" })
  const kpis: Kpi[] = [
    { label: "Vendido en 30 días", value: `${qtyText(sold30)} ${unit}`, ...(sold60 > 0 ? { hint: `${sold30 >= sold60 ? "+" : "−"}${Math.abs(((sold30 - sold60) / sold60) * 100).toFixed(0)} % vs. mes anterior`, trend: sold30 >= sold60 ? ("up" as const) : ("down" as const), tone: sold30 >= sold60 ? ("green" as const) : ("red" as const) } : { tone: "blue" as const }) },
    { label: "Stock alcanza para", value: Number.isFinite(coverDays) ? `${Math.max(0, Math.floor(coverDays))} días` : sold30 ? "—" : "sin ventas", hint: `${qtyText(stock)} ${unit}`, tone: stock <= 0 ? "red" : coverDays < 7 ? "gold" : "blue" },
    ...(showMoney ? [{ label: "Margen", value: `${margin.toFixed(1)} %`, hint: `precio ${money(product.salePrice, ctx.currency)}`, tone: margin < 10 ? ("red" as const) : ("green" as const) }] : []),
    { label: "Clase ABC", value: abc ?? "—", hint: rank >= 0 ? `puesto ${rank + 1} de ${m.products.length}` : "sin ventas", tone: abc === "A" ? "gold" : "slate" },
  ]
  return { text: lines.join("\n"), links, kpis }
}

export async function findProductForInsight(ctx: TenantContext, terms: string[]) {
  return terms.length ? searchProducts(ctx, terms) : []
}

/* ───────────── Diagnóstico y plan para crecer ───────────── */

type Finding = { score: number; title: string; detail: string; action: string; link?: Link }

async function findings(ctx: TenantContext, m: Metrics): Promise<Finding[]> {
  const out: Finding[] = []
  const money_ = (n: number) => money(n, ctx.currency)
  const showMoney = fin(ctx)
  if (m.count === 0) return out
  if (m.stockoutsSelling.length) {
    out.push({ score: 95, title: "Quiebres de stock en productos que se venden", detail: `${m.stockoutsSelling.length} producto(s) con ventas recientes están agotados: ${m.stockoutsSelling.slice(0, 4).join(", ")}${m.stockoutsSelling.length > 4 ? "…" : ""}.`, action: "Repón primero estos: cuando falta un producto que se vende, el cliente se va a otra tienda (y a veces no vuelve).", link: { label: "Qué comprar", href: "/compras/requerimiento" } })
  }
  if (showMoney && m.grossMargin > 0 && m.grossMargin < 15) {
    out.push({ score: 85, title: "Margen bruto bajo", detail: `Tu margen bruto es ${m.grossMargin.toFixed(1)} %; en bodegas y minimarkets suele estar entre 15 % y 25 % (referencia general).`, action: "Sube precios en productos de impulso (snacks, bebidas frías, golosinas) donde el cliente compara menos, y negocia costos en los de mayor rotación.", link: { label: "Márgenes", href: "/productos" } })
  }
  if (showMoney && m.inventoryValue > 0 && m.deadValue / m.inventoryValue > 0.2) {
    out.push({ score: 75, title: "Dinero inmovilizado en productos que no rotan", detail: `${money_(m.deadValue)} (${pct(m.deadValue, m.inventoryValue)} del inventario al costo) está en productos sin ventas en 30 días.`, action: "Liquida con combos u ofertas, devuelve al proveedor si se puede y deja de reponerlos. Ese dinero rinde más en productos A." })
  }
  if (m.itemsPerTicket > 0 && m.itemsPerTicket < 2.5) {
    out.push({ score: 70, title: "Pocos productos por venta", detail: `Cada venta lleva en promedio ${m.itemsPerTicket.toFixed(1)} producto(s) y el ticket promedio es ${money_(m.ticket)}.`, action: "Pon productos de impulso junto a la caja, sugiere el complemento al cobrar («¿y su pan?», «¿una gaseosa helada?») y arma combos de productos que ya se llevan juntos." })
  }
  if (m.prevSales > 0) {
    const growth = ((m.sales - m.prevSales) / m.prevSales) * 100
    if (growth < -10) out.push({ score: 80, title: "Las ventas bajaron", detail: `Vendiste ${Math.abs(growth).toFixed(0)} % menos que los 30 días anteriores.`, action: "Revisa si faltó stock de los más vendidos, si abrió competencia cerca o si cambiaron tus horarios. Recupera clientes con una promoción visible en la puerta y en WhatsApp." })
  }
  if (m.top20Share > 85 && m.soldProducts >= 10) {
    out.push({ score: 55, title: "Ventas muy concentradas", detail: `El 20 % de tus productos genera el ${m.top20Share.toFixed(0)} % de las ventas.`, action: "Esos productos A nunca deben faltar: cómpralos con stock de seguridad y ten un segundo proveedor." })
  }
  if (m.activeProducts > 0 && m.soldProducts / m.activeProducts < 0.5 && m.activeProducts >= 20) {
    out.push({ score: 50, title: "Surtido que no se mueve", detail: `Solo ${m.soldProducts} de ${m.activeProducts} productos se vendieron en 30 días.`, action: "Depura el surtido: menos referencias que no rotan y más profundidad en lo que el barrio sí compra." })
  }
  if (showMoney && m.sales > 0 && m.losses / m.sales > 0.02) {
    out.push({ score: 65, title: "Mermas altas", detail: `Las mermas suman ${money_(m.losses)} (${pct(m.losses, m.sales)} de las ventas); lo sano es menos del 1–2 %.`, action: "Aplica «primero en vencer, primero en salir», compra perecibles más seguido y en menor cantidad, y revisa vencimientos cada semana.", link: { label: "Vencimientos", href: "/inventario/alertas" } })
  }
  if (m.creditShare > 15 || (m.sales > 0 && m.receivables > m.sales * 0.25)) {
    out.push({ score: 60, title: "Mucho fiado", detail: `El crédito es ${m.creditShare.toFixed(0)} % de lo cobrado y tienes ${money_(m.receivables)} por cobrar.`, action: "Pon un límite por cliente, cobra en fechas fijas (quincena y fin de mes) y no fíes a quien ya debe más de su límite.", link: { label: "Quién me debe", href: "/clientes" } })
  }
  if (m.registeredShare < 10) {
    out.push({ score: 40, title: "Casi no conoces a tus clientes", detail: `Solo el ${m.registeredShare.toFixed(0)} % de las ventas está asociado a un cliente registrado.`, action: "Registra a tus clientes frecuentes (nombre y WhatsApp): podrás avisarles ofertas, saber quién dejó de venir y premiarlos." })
  }
  if (m.digitalShare < 20) {
    out.push({ score: 35, title: "Pocos pagos digitales", detail: `Solo el ${m.digitalShare.toFixed(0)} % se paga con tarjeta o transferencia/Yape/Plin.`, action: "Pon el QR de Yape/Plin bien visible en la caja: los pagos digitales suben el ticket (el cliente no se limita a lo que trae en efectivo) y reducen el manejo de sencillo." })
  }
  if (m.weakDay != null && m.bestDay != null && m.weakDay !== m.bestDay) {
    out.push({ score: 30, title: "Día flojo", detail: `El ${DOWS[m.weakDay]} es tu día más bajo y el ${DOWS[m.bestDay]} el más alto.`, action: `Lanza una oferta fija del ${DOWS[m.weakDay]} («${DOWS[m.weakDay]} de ofertas») para mover tráfico ese día.` })
  }
  if (m.payables > 0 && m.sales > 0 && m.payables > m.sales) {
    out.push({ score: 58, title: "Deuda con proveedores alta", detail: `Debes ${money_(m.payables)} a proveedores, más que lo vendido en 30 días.`, action: "Prioriza pagar a los proveedores de tus productos A y negocia plazos de crédito acordes a la rotación (que el producto se venda antes de pagarlo).", link: { label: "Por pagar", href: "/compras/por-pagar" } })
  }
  return out.sort((a, b) => b.score - a.score)
}

export async function growthPlan(ctx: TenantContext): Promise<AdvisorReply> {
  const m = await metrics(ctx)
  const showMoney = fin(ctx)
  if (m.count === 0) {
    return {
      text: "Todavía no tengo ventas de los últimos 30 días para analizar tu negocio. Mientras tanto, te cuento, la base de cualquier minimarket que crece es: 1) nunca quedarte sin los productos que más se venden, 2) precios revisados contra el mercado, 3) caja cuadrada todos los días y 4) clientes registrados para fidelizarlos. Vende unos días con Punto y vuelve a pedirme el diagnóstico.",
      links: [],
    }
  }
  const growth = m.prevSales > 0 ? ((m.sales - m.prevSales) / m.prevSales) * 100 : null
  const list = await findings(ctx, m)
  const lines = [
    `¡Vamos a hacer crecer **${ctx.businessName}**! 💪 Revisé tus números de los últimos 30 días:`,
    showMoney ? `Hiciste ${m.count} ventas, en promedio ${money(m.dailyAvg, ctx.currency)} al día.` : `Hiciste ${m.count} ventas.`,
    "",
    "Un minimarket crece moviendo tres palancas: **más clientes**, **que cada cliente compre más** y **mejor margen**. Esto es lo que yo atacaría primero, de lo más urgente a lo menos:",
    "",
  ]
  if (!list.length) lines.push("¡Tu operación está sana! 🎉 No veo alertas importantes, así que ahora toca crecer en clientes y en ticket.")
  list.slice(0, 6).forEach((f, i) => lines.push(`**${i + 1}. ${f.title}** — ${f.detail}`, `   👉 Te recomiendo: ${f.action.charAt(0).toLowerCase()}${f.action.slice(1)}`))
  const best = m.products[0]
  lines.push(
    "",
    "**🗓️ Tu plan de 30-60-90 días**",
    `- **30 días — ordenar:** cero quiebres en tus productos A${best ? ` (empezando por ${best.name})` : ""}, precios revisados contra el mercado, caja cuadrada a diario y vencimientos revisados cada semana.`,
    "- **60 días — vender más a cada cliente:** combos con productos que ya se llevan juntos, impulso en la caja, QR de Yape/Plin visible, oferta fija en tu día flojo y registro de clientes frecuentes.",
    "- **90 días — atraer más clientes:** perfil en Google Maps con fotos y horario, grupo o lista de difusión de WhatsApp con ofertas semanales, pedidos por WhatsApp con reparto en el barrio y nuevas categorías que te pidan (panadería, frío, recargas, agentes).",
    "",
    "**📈 Lo que vamos a medir cada semana:** ventas diarias, ticket promedio, productos por venta, margen bruto, quiebres de stock y mermas. Pregúntame «¿cómo va el negocio?» cuando quieras y lo revisamos juntos.",
  )
  const links: Link[] = []
  if (showMoney) links.push({ label: "Informes", href: "/informes" })
  if (list.find((f) => f.link)) links.push(list.find((f) => f.link)!.link!)
  const kpis: Kpi[] = [
    { label: "Ventas 30 días", value: showMoney ? money(m.sales, ctx.currency) : String(m.count), ...(growth != null ? { hint: `${growth >= 0 ? "+" : "−"}${Math.abs(growth).toFixed(0)} % vs. mes anterior`, trend: growth >= 0 ? ("up" as const) : ("down" as const), tone: growth >= 0 ? ("green" as const) : ("red" as const) } : { tone: "blue" as const }) },
    { label: "Ticket promedio", value: money(m.ticket, ctx.currency), hint: `${m.itemsPerTicket.toFixed(1)} productos por venta`, tone: m.itemsPerTicket < 2.5 ? "gold" : "green" },
    ...(showMoney ? [{ label: "Margen bruto", value: `${m.grossMargin.toFixed(1)} %`, hint: "referencia 15–25 %", tone: m.grossMargin < 15 ? ("red" as const) : ("green" as const) }] : []),
    { label: "Alertas", value: String(list.length), hint: list.length ? "para atender" : "todo en orden", tone: list.length > 2 ? "red" : list.length ? "gold" : "green" },
  ]
  return { text: lines.join("\n"), links, kpis }
}

/* ───────────── Temas de gestión (experto) ───────────── */

type Topic = { id: string; keywords: string[]; build: (ctx: TenantContext, m: Metrics) => Promise<AdvisorReply> | AdvisorReply }

const T = (title: string, intro: string, steps: string[], measure: string, extra: string[] = [], links: Link[] = [], kpis: Kpi[] = []): AdvisorReply => ({
  text: [`**${title}**`, intro, "", "**💡 Lo que yo haría en tu lugar**", ...steps.map((s, i) => `${i + 1}. ${s}`), "", `**📈 Cómo saber si funciona:** ${measure}`, ...(extra.length ? ["", ...extra] : [])].join("\n"),
  links,
  kpis,
})

/** Indicadores de la tienda que acompañan a cada tema (solo cifras que el usuario puede ver). */
function topicKpis(ctx: TenantContext, m: Metrics, id: string): Kpi[] {
  if (!m.count) return []
  const showMoney = fin(ctx)
  const k: Record<string, Kpi[]> = {
    precios: showMoney ? [{ label: "Margen bruto", value: `${m.grossMargin.toFixed(1)} %`, hint: "referencia 15–25 %", tone: m.grossMargin < 15 ? "red" : "green" }, { label: "Ticket promedio", value: money(m.ticket, ctx.currency), tone: "gold" }] : [],
    surtido: [{ label: "Productos que se venden", value: `${m.soldProducts} de ${m.activeProducts}`, tone: "blue" }, { label: "Peso del top 20 %", value: `${m.top20Share.toFixed(0)} %`, hint: "de las ventas", tone: "gold" }],
    exhibicion: [{ label: "Productos por venta", value: m.itemsPerTicket.toFixed(1), hint: "meta: 3 o más", tone: m.itemsPerTicket < 2.5 ? "gold" : "green" }],
    promociones: [{ label: "Productos por venta", value: m.itemsPerTicket.toFixed(1), tone: m.itemsPerTicket < 2.5 ? "gold" : "green" }, ...(showMoney ? [{ label: "Ticket promedio", value: money(m.ticket, ctx.currency), tone: "blue" as const }] : []), ...(m.weakDay != null ? [{ label: "Día más flojo", value: DOWS[m.weakDay], tone: "slate" as const }] : [])],
    fidelizacion: [{ label: "Ventas a clientes registrados", value: `${m.registeredShare.toFixed(0)} %`, hint: "meta: 30 % o más", tone: m.registeredShare < 10 ? "red" : "green" }, { label: "Pagos digitales", value: `${m.digitalShare.toFixed(0)} %`, tone: "blue" }],
    inventario: [{ label: "Agotados que se venden", value: String(m.stockoutsSelling.length), tone: m.stockoutsSelling.length ? "red" : "green" }, ...(showMoney ? [{ label: "Stock sin rotar", value: money(m.deadValue, ctx.currency), tone: "gold" as const }] : [])],
    proveedores: can(ctx.role, "purchases", ctx.grants) ? [{ label: "Por pagar", value: money(m.payables, ctx.currency), tone: "gold" }] : [],
    caja: showMoney ? [{ label: "Ventas 30 días", value: money(m.sales, ctx.currency), tone: "blue" }, { label: "Ganancia bruta", value: money(m.sales - m.cost, ctx.currency), tone: "green" }, { label: "Por cobrar", value: money(m.receivables, ctx.currency), tone: "gold" }] : [],
    mermas: showMoney ? [{ label: "Mermas 30 días", value: money(m.losses, ctx.currency), hint: `${pct(m.losses, m.sales)} de las ventas`, tone: m.sales && m.losses / m.sales > 0.02 ? "red" : "green" }] : [],
    expansion: showMoney ? [{ label: "Venta diaria", value: money(m.dailyAvg, ctx.currency), tone: "blue" }, { label: "Margen bruto", value: `${m.grossMargin.toFixed(1)} %`, tone: "green" }] : [],
  }
  return k[id] ?? []
}

const TOPICS: Topic[] = [
  {
    id: "precios",
    keywords: ["fijar precios", "fijo mis precios", "fijo precios", "fijar mis precios", "pongo mis precios", "calcular el precio", "calculo el precio", "calcular precios", "precio justo", "cuanto le gano", "poner precios", "precio de venta", "estrategia de precios", "cuanto ganar", "que margen", "margen ideal", "cuanto cobrar", "subir precios", "bajar precios", "precios competitivos", "markup", "rentabilidad por producto"],
    build: (ctx, m) =>
      T(
        "Estrategia de precios para un minimarket",
        fin(ctx) && m.count ? `Hoy tu margen bruto es **${m.grossMargin.toFixed(1)} %** (referencia general del sector: 15–25 %).` : "El precio es la palanca más rápida para mejorar la ganancia, pero hay que usarla con criterio.",
        [
          "Separa tus productos en tres grupos: **gancho** (arroz, azúcar, aceite, leche: el cliente conoce el precio; márgenes de 5–12 %), **rotación** (abarrotes y limpieza: 15–25 %) e **impulso** (snacks, golosinas, bebidas frías, helados: 25–40 %).",
          "Mantén los ganchos al precio del mercado o un poco debajo: hacen que el cliente entre y confíe. Gana en lo de impulso.",
          "Calcula el precio desde el costo: precio = costo ÷ (1 − margen deseado). Ej.: costo S/ 2.00 y margen 25 % → S/ 2.67 → redondea a S/ 2.70.",
          "Usa precios psicológicos (S/ 2.90 en vez de S/ 3.00) en productos de impulso; en ganchos, precios redondos y claros.",
          "Revisa precios cada vez que llega una compra con costo nuevo (Recepción puede actualizar el precio de venta) y compara una vez al mes con supermercados.",
        ],
        "margen bruto mensual y margen por grupo; ningún producto por debajo del costo.",
        ["Pídeme «margen bajo» para ver los productos a corregir o «precio de [producto] en supermercados» para comparar."],
        [{ label: "Productos y marcas", href: "/productos" }],
      ),
  },
  {
    id: "surtido",
    keywords: ["surtido", "que productos vender", "que mas vender", "nuevos productos", "que productos agregar", "categorias", "que productos tener", "mix de productos", "analisis abc", "abc", "pareto"],
    build: (ctx, m) =>
      T(
        "Surtido: qué vender y qué dejar",
        m.count ? `En 30 días vendiste ${m.soldProducts} de tus ${m.activeProducts} productos activos; el 20 % de los productos hace el ${m.top20Share.toFixed(0)} % de la venta.` : "El surtido correcto es el que tu barrio compra, no el que más espacio ocupa.",
        [
          "Haz un análisis **ABC**: A = productos que suman el 80 % de la venta (nunca deben faltar), B = el siguiente 15 %, C = el último 5 % (candidatos a salir).",
          "Profundiza en A: más presentaciones y marcas de lo que ya se vende.",
          "Depura C: si no rota en 60 días, liquídalo y no lo repongas.",
          "Escucha al cliente: anota lo que te piden y no tienes; si se repite, agrégalo.",
          "Categorías que suelen hacer crecer a un minimarket: bebidas frías, panadería, lácteos y embutidos refrigerados, snacks, limpieza, cuidado personal, mascotas y servicios (recargas, agente bancario).",
        ],
        "productos vendidos ÷ productos activos (meta: más de 70 %) y venta por categoría.",
        ["Pídeme «productos sin movimiento» y «productos más vendidos del mes» para empezar."],
        [{ label: "Informes", href: "/informes" }],
      ),
  },
  {
    id: "exhibicion",
    keywords: ["exhibicion", "exhibir", "ordenar la tienda", "como ordenar", "layout", "gondola", "anaquel", "estantes", "vitrina", "merchandising", "punto de venta visual", "como acomodar"],
    build: () =>
      T(
        "Exhibición que vende más",
        "Lo que el cliente ve, lo compra. Una buena exhibición puede subir las ventas sin gastar en publicidad.",
        [
          "Productos de primera necesidad al fondo: el cliente recorre la tienda y ve más productos en el camino.",
          "A la altura de los ojos, lo de mayor margen; abajo, lo pesado y barato; arriba, lo de menor rotación.",
          "Zona de caja = impulso: golosinas, chicles, pilas, snacks pequeños, bebidas frías al alcance.",
          "Agrupa por uso (desayuno: pan, leche, café, mantequilla) y pon juntos los productos que ya se compran juntos.",
          "Frentes llenos y ordenados (un estante vacío parece tienda sin stock) y precios visibles en todo.",
          "Cambia la exhibición de ofertas cada semana para que el cliente frecuente descubra algo nuevo.",
        ],
        "productos por venta y ticket promedio antes y después del cambio.",
      ),
  },
  {
    id: "promociones",
    keywords: ["promocion", "promociones", "ofertas", "oferta", "descuentos", "combos", "combo", "packs", "2x1", "atraer clientes", "como vender mas", "vender mas", "aumentar ventas", "subir ventas", "mas ventas"],
    build: (ctx, m) =>
      T(
        "Promociones que sí dejan ganancia",
        fin(ctx) && m.count ? `Hoy tu ticket promedio es ${money(m.ticket, ctx.currency)} con ${m.itemsPerTicket.toFixed(1)} productos por venta${m.weakDay != null ? `, y tu día más flojo es el ${DOWS[m.weakDay]}` : ""}.` : "Una promoción debe tener un objetivo: traer clientes, subir el ticket o mover stock.",
        [
          "**Combos** con productos que ya se compran juntos (desayuno, lonchera, parrilla, limpieza): suben el ticket sin regalar margen.",
          "**Oferta del día flojo** fija cada semana: crea costumbre y mueve tráfico.",
          "**Lleva 2 / lleva 3** en productos de alta rotación y buen margen (bebidas, snacks).",
          "Liquida lo que está por vencer o no rota con precio especial antes de que sea merma.",
          "Comunica: cartel grande en la puerta, precio visible y mensaje por WhatsApp a tus clientes.",
          "Nunca promociones un producto por debajo del costo salvo que sea para liquidar.",
        ],
        "ventas y margen del producto promocionado y ticket promedio durante la promoción contra la semana anterior.",
        ["Pídeme el «análisis de [producto]» para ver con qué se compra y armar el combo."],
      ),
  },
  {
    id: "fidelizacion",
    keywords: ["fidelizar", "fidelizacion", "clientes frecuentes", "que vuelvan", "retener clientes", "lealtad", "tarjeta de puntos", "puntos", "atencion al cliente", "servicio al cliente", "whatsapp"],
    build: (ctx, m) =>
      T(
        "Fidelización: que el cliente vuelva y te prefiera",
        m.count ? `Hoy solo el ${m.registeredShare.toFixed(0)} % de tus ventas está asociado a un cliente registrado.` : "En el barrio gana quien conoce a sus clientes por su nombre.",
        [
          "Registra a tus clientes frecuentes con nombre y WhatsApp (en Punto: Clientes).",
          "Lista de difusión de WhatsApp: una vez por semana, ofertas y novedades (no más, para no cansar).",
          "Programa simple de premios: cada 10 compras, un producto de regalo o un descuento.",
          "Atención: saludo, rapidez en caja, cambio exacto, bolsas a mano y aceptar Yape/Plin.",
          "Pedidos por WhatsApp con reparto en el barrio para adultos mayores y familias ocupadas.",
          "Revisa quién dejó de venir y escríbele.",
        ],
        "porcentaje de ventas a clientes registrados y frecuencia de compra de tus mejores clientes.",
        [],
        [{ label: "Clientes", href: "/clientes" }],
      ),
  },
  {
    id: "inventario",
    keywords: ["controlar inventario", "control de inventario", "manejar inventario", "cuanto comprar", "cada cuanto comprar", "stock de seguridad", "rotacion", "no quedarme sin stock", "sobrestock", "capital de trabajo"],
    build: (ctx, m) =>
      T(
        "Inventario: ni que falte ni que sobre",
        m.count ? `Tienes ${m.stockoutsSelling.length} producto(s) que se venden agotados${fin(ctx) ? ` y ${money(m.deadValue, ctx.currency)} en stock sin ventas en 30 días` : ""}.` : "El inventario es dinero en el estante: debe rotar.",
        [
          "Define un stock mínimo por producto = venta diaria × días que tarda el proveedor + un colchón de seguridad.",
          "Productos A: revisión diaria; B: semanal; C: quincenal.",
          "Compra según lo que se vende, no según la oferta del vendedor: el «precio por volumen» no sirve si el producto se queda meses.",
          "Haz un conteo cíclico: cada semana cuenta una categoría (Toma de inventario) para detectar faltantes y robos.",
          "Perecibles: primero en vencer, primero en salir, y pedidos chicos y frecuentes.",
        ],
        "quiebres de stock por semana, días de cobertura de los productos A (meta 7–14) y valor del stock sin rotación.",
        ["Pídeme «¿qué debo comprar?» para la sugerencia de compra según tus ventas."],
        [{ label: "Requerimiento", href: "/compras/requerimiento" }, { label: "Toma de inventario", href: "/inventario/conteo" }],
      ),
  },
  {
    id: "proveedores",
    keywords: ["negociar con proveedores", "negociar", "mejores precios de compra", "comprar mas barato", "proveedores", "mayorista", "distribuidor", "comprar al por mayor", "credito de proveedores"],
    build: (ctx, m) =>
      T(
        "Compras y proveedores: ganar desde la compra",
        can(ctx.role, "purchases", ctx.grants) && m.payables ? `Hoy debes ${money(m.payables, ctx.currency)} a proveedores.` : "La ganancia se hace al comprar bien: cada céntimo que bajas del costo es margen.",
        [
          "Ten al menos dos proveedores para tus productos A y compáralos cada mes (distribuidor, mayorista y mercado mayorista).",
          "Negocia con datos: «te compro X unidades al mes» te da poder para pedir descuento, bonificación o crédito.",
          "Pide crédito de 7–15 días en productos que rotan rápido: los vendes antes de pagarlos.",
          "Aprovecha bonificaciones (12+1) y exhibición pagada de marcas, pero solo en productos que rotan.",
          "Paga puntual a los proveedores clave: el buen historial te da mejores condiciones.",
        ],
        "costo de tus 10 productos A mes a mes y días de crédito promedio con proveedores.",
        [],
        [{ label: "Proveedores", href: "/compras/proveedores" }],
      ),
  },
  {
    id: "caja",
    keywords: ["flujo de caja", "manejar el dinero", "separar gastos", "no me alcanza", "donde se va el dinero", "finanzas", "ahorrar", "capital", "liquidez", "sueldo del dueno", "ganancia real", "contabilidad"],
    build: (ctx, m) =>
      T(
        "Flujo de caja: que el dinero del negocio no se pierda",
        fin(ctx) && m.count ? `En 30 días vendiste ${money(m.sales, ctx.currency)} con una ganancia bruta estimada de ${money(m.sales - m.cost, ctx.currency)}.` : "Vender mucho no sirve si el dinero se pierde en el camino.",
        [
          "Separa el dinero del negocio y el de la casa: asígnate un sueldo fijo y no saques de la caja.",
          "Cuadra la caja todos los días (Cierre de caja) y registra cada gasto como egreso.",
          "Reserva cada día un porcentaje de las ventas para reponer mercadería: es el dinero de tu próxima compra.",
          "Controla el fiado con límite y fechas de cobro: es dinero que ya no tienes.",
          "Calcula tu ganancia real: ganancia bruta − gastos fijos (alquiler, luz, sueldos, internet).",
          "Ten un fondo para emergencias de al menos un mes de gastos fijos.",
        ],
        "ganancia bruta mensual, gastos de caja, cuentas por cobrar y dinero disponible para reponer.",
        [],
        [{ label: "Informes", href: "/informes" }],
      ),
  },
  {
    id: "mermas",
    keywords: ["reducir mermas", "mermas", "perdidas", "robos", "hurto", "productos vencidos", "evitar vencimientos", "faltantes"],
    build: (ctx, m) =>
      T(
        "Mermas, vencimientos y robos",
        fin(ctx) && m.sales ? `Tus mermas registradas en 30 días: ${money(m.losses, ctx.currency)} (${pct(m.losses, m.sales)} de las ventas; lo sano es menos del 1–2 %).` : "Cada merma es ganancia que se va a la basura.",
        [
          "Primero en vencer, primero en salir: lo que vence antes, adelante.",
          "Revisa vencimientos cada semana y liquida con oferta lo que vence en 15 días.",
          "Registra toda merma en Punto para saber cuánto pierdes y en qué productos.",
          "Conteos cíclicos de los productos más robados (licores, chocolates, cuidado personal, pilas) y ubícalos cerca de la caja.",
          "Recibe la mercadería contando contra la factura: los faltantes del proveedor también son merma.",
        ],
        "mermas ÷ ventas por mes y diferencias en las tomas de inventario.",
        [],
        [{ label: "Mermas", href: "/inventario/conteo?v=mermas" }, { label: "Vencimientos", href: "/inventario/alertas" }],
      ),
  },
  {
    id: "marketing",
    keywords: ["marketing", "publicidad", "redes sociales", "facebook", "instagram", "tiktok", "google maps", "darme a conocer", "conseguir clientes", "mas clientes", "atraer mas clientes", "volantes"],
    build: () =>
      T(
        "Marketing local para minimarket",
        "Tu mercado está a pocas cuadras: el marketing que funciona es local, visible y constante.",
        [
          "Crea o completa tu perfil de **Google Maps** (Perfil de Empresa): fotos, horario, teléfono y WhatsApp. Es gratis y muchos te buscan ahí.",
          "Fachada limpia, iluminada y con letrero claro; carteles de ofertas grandes en la puerta.",
          "Facebook/Instagram/TikTok del barrio: fotos de ofertas, productos nuevos y combos; publica 2–3 veces por semana.",
          "WhatsApp Business con catálogo y respuestas rápidas para pedidos.",
          "Alianzas con vecinos: colegio, panadería, gimnasio o mototaxis (descuentos cruzados).",
        ],
        "clientes nuevos por semana, pedidos por WhatsApp y ventas del día de la oferta.",
      ),
  },
  {
    id: "delivery",
    keywords: ["delivery", "reparto", "pedidos por whatsapp", "vender por internet", "tienda online", "rappi", "pedidosya", "venta online"],
    build: () =>
      T(
        "Delivery y pedidos por WhatsApp",
        "Llevar el pedido a casa fideliza y sube el ticket: quien pide por WhatsApp suele comprar más que quien entra por un producto.",
        [
          "Empieza con WhatsApp Business: catálogo con fotos y precios y un mensaje de bienvenida con el horario de reparto.",
          "Reparto en un radio corto (5–10 cuadras), con pedido mínimo y costo de envío claro o gratis desde cierto monto.",
          "Cobra con Yape/Plin al confirmar el pedido para evitar cancelaciones.",
          "Aplicaciones (Rappi, PedidosYa) cobran comisión: úsalas solo en productos de buen margen o con precios ajustados.",
          "Registra al cliente en Punto para conocer su frecuencia.",
        ],
        "pedidos por semana, ticket promedio del delivery y clientes que repiten.",
      ),
  },
  {
    id: "formalizacion",
    keywords: ["formalizar", "formalizacion", "ruc", "rus", "nuevo rus", "rer", "regimen mype", "regimen tributario", "impuestos", "sunat", "boleta electronica", "factura electronica", "igv"],
    build: () =>
      T(
        "Formalización y régimen tributario (orientación general)",
        "Estar formal te permite vender a empresas (factura), acceder a créditos bancarios y comprar a mayoristas que exigen RUC.",
        [
          "Un minimarket pequeño suele empezar en el **Nuevo RUS** (cuota mensual fija, solo emite boletas); al crecer o necesitar facturas, pasa al **RER** o al **Régimen MYPE Tributario**.",
          "Emite comprobante electrónico en cada venta (Punto ya lo hace: nota de venta, boleta y factura).",
          "Guarda tus facturas de compra: en los regímenes generales, el IGV de las compras se descuenta del IGV de las ventas.",
          "Revisa con un contador qué régimen te conviene según tus ventas anuales y tus compras; los límites y tasas los fija SUNAT y pueden cambiar.",
        ],
        "comprobantes emitidos vs. ventas registradas, y declaraciones al día.",
        ["_Esto es una orientación general, no asesoría tributaria: confirma tu caso con un contador o con SUNAT._"],
        [{ label: "Comprobantes", href: "/facturacion" }],
      ),
  },
  {
    id: "expansion",
    keywords: ["segunda tienda", "otra tienda", "abrir otro local", "expandir", "expansion", "sucursal", "franquicia", "agrandar el local", "invertir", "prestamo", "credito bancario", "mayoreo", "vender al por mayor"],
    build: (ctx, m) =>
      T(
        "Crecer: ¿segunda tienda, ampliar o mayoreo?",
        fin(ctx) && m.count ? `Antes de expandir, tu tienda actual debe ser rentable y ordenada: hoy promedias ${money(m.dailyAvg, ctx.currency)} diarios con ${m.grossMargin.toFixed(1)} % de margen bruto.` : "Expandir multiplica lo que ya haces: si hay desorden, también se multiplica.",
        [
          "Primero exprime el local actual: horario extendido, nuevas categorías, delivery y mayoreo a bodegas pequeñas o restaurantes del barrio.",
          "Antes de una segunda tienda: 6 meses de ganancia estable, procesos escritos (caja, compras, inventario) y alguien de confianza que la maneje.",
          "Elige ubicación con datos: flujo de gente, competencia cercana, alquiler (que no pase de ~10 % de la venta esperada).",
          "Financia con ahorro o crédito MYPE solo si el plan muestra que la tienda paga la cuota con su propia ganancia.",
          "En Punto puedes manejar varias sucursales, almacenes y cajas con el mismo sistema.",
        ],
        "ganancia neta mensual, ventas por metro cuadrado y meses de recuperación de la inversión.",
        [],
        [{ label: "Configuración", href: "/configuracion" }],
      ),
  },
  {
    id: "personal",
    keywords: ["personal", "empleados", "trabajadores", "cajero confiable", "contratar", "capacitar", "robos de empleados", "turnos"],
    build: () =>
      T(
        "Personal y control",
        "Con personal, el sistema es tu mejor aliado: cada venta, caja y ajuste queda registrado por usuario.",
        [
          "Cada trabajador con su propio usuario y solo los permisos que necesita (Configuración → Usuarios).",
          "Cierre de caja al final de cada turno, con conteo y diferencia firmada.",
          "Ajustes de stock y anulaciones solo para el dueño o el encargado.",
          "Capacita en atención: saludo, sugerir el complemento y ofrecer pagos digitales.",
          "Premia por metas (ventas del turno, cero diferencias de caja).",
        ],
        "diferencias de caja por turno, anulaciones y ventas por vendedor.",
        ["Pídeme «¿quién vendió más este mes?» para ver el rendimiento por usuario."],
        [{ label: "Configuración", href: "/configuracion" }],
      ),
  },
]

/** Puntaje de un tema para la pregunta (0 si no aplica). */
export function topicScore(m: string) {
  const text = ` ${m} `
  let best: { topic: Topic; score: number } | null = null
  for (const topic of TOPICS) {
    let score = 0
    for (const k of topic.keywords) {
      const kw = fold(k)
      if (text.includes(` ${kw} `)) score += 10 + kw.length
    }
    if (score && (!best || score > best.score)) best = { topic, score }
  }
  return best
}

export async function expertTopic(ctx: TenantContext, m: string): Promise<AdvisorReply | null> {
  const best = topicScore(m)
  if (!best) return null
  const stats = await metrics(ctx)
  const reply = await best.topic.build(ctx, stats)
  return { ...reply, kpis: reply.kpis?.length ? reply.kpis : topicKpis(ctx, stats, best.topic.id) }
}
