/**
 * PIX en Punto Fadey: entiende la pregunta, revisa permisos y responde con datos del negocio,
 * guías de los módulos o información externa. Funciona 100 % en el servidor y sin claves de IA
 * (igual que PIX de Resto Fadey): las reglas detectan la intención y las consultas leen la base.
 */
import { can, ROLE_LABEL, type Permission } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"
import * as data from "@/lib/pix/data"
import type { Link, ToolResult } from "@/lib/pix/data"
import { calendarText, foodFactsText, openFoodFacts, pricesText, sizeNorm, supermarketPrices } from "@/lib/pix/external"
import { findGuide, guidesFor, guideText } from "@/lib/pix/guides"
import { forgetAll, forgetMatching, recall, rememberNote, setGoal, type Memory } from "@/lib/pix/history"
import { fold, money, parsePeriod, searchTerms, type Period } from "@/lib/pix/text"
import { prisma } from "@/lib/db"

export const ASSISTANT_NAME = "PIX"

export type PixReply = {
  reply: string
  links: Link[]
  suggestions: string[]
  /** Qué respondió (para el historial y las pruebas): nombre de la consulta, guía o fuente externa. */
  source: string
}

/* ───────────── Límite de mensajes y contexto de la conversación ───────────── */

const RATE = new Map<string, { start: number; count: number }>()
const MAX_PER_MIN = 20

export function checkRate(userId: string) {
  const now = Date.now()
  let bucket = RATE.get(userId)
  if (!bucket || now - bucket.start > 60_000) {
    bucket = { start: now, count: 0 }
    RATE.set(userId, bucket)
  }
  bucket.count += 1
  return bucket.count <= MAX_PER_MIN
}

/** Última consulta de datos de cada usuario, para entender «¿y ayer?» o «¿y el mes pasado?». */
const LAST_INTENT = new Map<string, { intent: string; at: number }>()

/* ───────────── Sugerencias según permisos ───────────── */

function has(ctx: TenantContext, permission: Permission) {
  return can(ctx.role, permission, ctx.grants)
}

export function suggestionsFor(ctx: TenantContext): string[] {
  const out: string[] = []
  if (data.canReports(ctx)) out.push("¿Cómo va el negocio hoy?", "¿Cuánto vendí esta semana?", "Productos más vendidos del mes", "¿Qué marcas venden más?")
  else if (has(ctx, "sell")) out.push("¿Cuánto vendí hoy?", "Productos más vendidos del mes")
  out.push("¿Qué productos están por agotarse?", "¿Qué vence en los próximos 30 días?")
  if (has(ctx, "cash")) out.push("¿Cuánto hay en caja?")
  if (has(ctx, "purchases") || data.canReports(ctx)) out.push("¿Qué debo comprar?")
  if (has(ctx, "customers")) out.push("¿Quién me debe?")
  if (has(ctx, "purchases")) out.push("¿Cuánto debo a proveedores?")
  out.push("Precio de leche Gloria en supermercados", "Feriados y fechas comerciales que se vienen", "¿Para qué sirve Almacenes?")
  return out
}

/* ───────────── Detección de intención ───────────── */

type Intent =
  | "sales"
  | "top"
  | "least"
  | "brands"
  | "sellers"
  | "peaks"
  | "briefing"
  | "low_stock"
  | "expiring"
  | "dead_stock"
  | "reorder"
  | "margins"
  | "inventory_value"
  | "losses"
  | "cash"
  | "cash_moves"
  | "payables"
  | "purchases"
  | "suppliers"
  | "receivables"
  | "top_customers"
  | "billing"

const PERIOD_INTENTS = new Set<Intent>(["sales", "top", "least", "brands", "sellers", "peaks", "briefing", "losses", "cash_moves", "purchases", "top_customers", "billing"])

/** Permiso que exige cada consulta (null = todos los usuarios). */
const NEEDS: Record<Intent, { any: Permission[] } | null> = {
  sales: { any: ["reports", "sell"] },
  top: { any: ["reports", "sell"] },
  least: { any: ["reports"] },
  brands: { any: ["reports"] },
  sellers: { any: ["reports"] },
  peaks: { any: ["reports"] },
  briefing: null,
  low_stock: null,
  expiring: null,
  dead_stock: null,
  reorder: { any: ["purchases", "reports"] },
  margins: { any: ["reports", "priceWrite"] },
  inventory_value: { any: ["reports"] },
  losses: { any: ["reports"] },
  cash: { any: ["cash", "cashClose"] },
  cash_moves: { any: ["cash", "reports"] },
  payables: { any: ["purchases"] },
  purchases: { any: ["purchases"] },
  suppliers: { any: ["purchases"] },
  receivables: { any: ["customers"] },
  top_customers: { any: ["reports"] },
  billing: { any: ["billing"] },
}

const DENIED: Record<string, string> = {
  reports: "Informes",
  sell: "Ventas",
  purchases: "Compras",
  customers: "Clientes",
  cash: "Caja",
  cashClose: "Cierre de caja",
  billing: "Facturación electrónica",
  priceWrite: "Modificar precios",
}

function detectIntent(m: string): Intent | null {
  if (/\b(venc|caduc|expir)/.test(m)) return "expiring"
  if (/sin (movimiento|rotacion|ventas)|no (se )?(vende|venden|rota|rotan|salen|sale)\b|estancad|parados?\b|inmoviliz|dormid/.test(m)) return "dead_stock"
  if (/\bque (debo|tengo que|deberia|hay que|me toca) (comprar|pedir|reponer)|sugerencia de compra|que (comprar|pedir|reponer)\b|lista de (compras|pedido)|\breponer\b|\breposicion\b|cuanto (debo |tengo que )?pedir/.test(m)) return "reorder"
  if (/margen|bajo (el )?costo|debajo del costo|perdiendo plata|pierdo (plata|dinero)|ganancia por producto/.test(m) && !/\bventas?\b.*\bmargen\b.*\b(hoy|semana|mes)\b/.test(m)) return "margins"
  if (/valor (del |de mi |total del )?(inventario|stock|almacen)|cuanto (vale|valen) (mi |el )?(inventario|stock|mercaderia)|inventario valorizado|capital en (stock|mercaderia)/.test(m)) return "inventory_value"
  if (/\bmermas?\b|\bperdidas?\b(?! de (dinero|plata))|productos? (danad|malogr|robad)/.test(m)) return "losses"
  if (/stock (bajo|minimo|critico)|bajo (el |su )?(stock )?minimo|agotad|por agotarse|se (estan|esta) (acabando|terminando)|sin stock|falta(n)? (productos|mercaderia)|que (me )?falta|alertas? de stock|que productos (faltan|se acaban)/.test(m)) return "low_stock"
  if (/hora (punta|pico)|horas? (de )?mas ventas|a que hora (se )?vend|que dia (se )?vend\w* mas|dia (de la semana )?(con )?mas ventas|mejor(es)? (dia|hora)/.test(m)) return "peaks"
  if (/(menos|peor(es)?) vendid|se venden? menos|vend\w* menos/.test(m)) return "least"
  if (/mas vendid|se venden? mas|vend\w* mas\b(?!.*(vendedor|cajero))|top (\d+ )?(de )?(productos|ventas)|lo que mas (se )?(vende|sale)|productos? estrella|mas (pedid|salida)|mas salen|que sale mas/.test(m) && !/vendedor|cajero|trabajador|quien vend|marca/.test(m)) return "top"
  if (/marcas?\b.*(vend|venta|mejor|mas|top|rankin)|(vend|venta).*por marca/.test(m)) return "brands"
  if (/vendedor|cajer[oa]s?\b.*(vend|mas|mejor|rankin)|quien (vendio|ha vendido|vende) mas|ventas por (usuario|trabajador|vendedor|cajero)|rendimiento del personal/.test(m)) return "sellers"
  if (/(cuanto|que) (hay|tengo|queda) en (la )?caja|efectivo (en|de) (la )?caja|estado de (la |mi )?caja|caja abierta|cajas abiertas|esta abierta la caja|cuanto deberia haber|efectivo esperado|como va (la|mi) caja/.test(m)) return "cash"
  if (/egresos?|gastos?|ingresos? de caja|retiros?|movimientos de caja/.test(m)) return "cash_moves"
  if (/(debo|deuda|deudas|pagar|pendiente) (a |con |de )?(los )?proveedor|por pagar|cuentas por pagar|pago pendiente|que debo pagar/.test(m)) return "payables"
  if (/\bcompras?\b|\bcompre\b|\bcompramos\b|pendientes? de recib|mercaderia por llegar|pedidos? (pendientes|por llegar)/.test(m) && !/como (registro|hago|se hace|registrar)/.test(m)) return "purchases"
  if (/\bproveedor(es)?\b/.test(m)) return "suppliers"
  if (/quien(es)? me debe|me deben|por cobrar|cuentas por cobrar|deudas? de (los )?clientes|fiad|clientes? (con )?deuda|cuentas pendientes|creditos? pendientes/.test(m)) return "receivables"
  if (/(mejores|principales|top) clientes|clientes? (que mas|frecuentes|fieles)|quien (me )?compra mas/.test(m)) return "top_customers"
  if (/comprobante|boletas?\b|facturas?\b|sunat|\bcdr\b|facturacion electronica|notas? de credito/.test(m) && !/como (emito|hago|saco|imprimo)/.test(m)) return "billing"
  if (/como (va|van|esta|estamos|vamos)( el| mi)? (negocio|tienda|bodega|minimarket|dia|todo)|como vamos|resumen (del |de )?(dia|negocio|hoy|general)|como me fue|que tal (el dia|hoy|las ventas)|estado del negocio|novedades/.test(m)) return "briefing"
  if (/\bventas?\b|\bvend(i|imos|io|ido|iste|e)\b|vendido|cuanto (hice|hicimos|facture|facturamos|gane|ganamos|entro|ingreso)|ingresos?|facturacion|recaud|ganancia|utilidad|ticket promedio/.test(m)) return "sales"
  return null
}

function paymentFilter(m: string) {
  if (/\befectivo\b|\bcash\b/.test(m)) return "CASH"
  if (/\btarjeta|\bvisa\b|\bpos\b/.test(m)) return "CARD"
  if (/\btransferencia|\byape\b|\bplin\b/.test(m)) return "TRANSFER"
  if (/\bcredito\b|\bfiado\b/.test(m)) return "CREDIT"
  return undefined
}

function defaultPeriod(intent: Intent): "today" | "month" | "week" | "30d" {
  if (["top", "least", "brands", "peaks", "top_customers", "purchases", "losses", "billing"].includes(intent)) return "month"
  return "today"
}

async function runIntent(ctx: TenantContext, intent: Intent, message: string, period: Period): Promise<ToolResult> {
  const m = fold(message)
  switch (intent) {
    case "sales":
      return data.salesSummary(ctx, period, { method: paymentFilter(m) })
    case "top":
      return data.topProducts(ctx, period, { byMoney: /importe|plata|dinero|soles|ingreso|factur/.test(m) })
    case "least":
      return data.topProducts(ctx, period, { least: true })
    case "brands":
      return data.topBrands(ctx, period)
    case "sellers":
      return data.salesBySeller(ctx, period)
    case "peaks":
      return data.salesPeaks(ctx, period.explicit ? period : parsePeriod("", "30d"))
    case "briefing":
      return data.briefing(ctx, period)
    case "low_stock":
      return data.lowStock(ctx)
    case "expiring": {
      const n = m.match(/(\d{1,3})\s*dias/)
      return data.expiring(ctx, n ? Math.min(365, Number(n[1])) : /semana/.test(m) ? 7 : 30)
    }
    case "dead_stock": {
      const n = m.match(/(\d{1,3})\s*dias/)
      return data.deadStock(ctx, n ? Math.min(365, Number(n[1])) : 30)
    }
    case "reorder":
      return data.reorderSuggestion(ctx)
    case "margins":
      return data.marginAlerts(ctx)
    case "inventory_value":
      return data.inventoryValueReport(ctx)
    case "losses":
      return data.lossesReport(ctx, period)
    case "cash":
      return data.cashStatus(ctx)
    case "cash_moves":
      return data.cashMovements(ctx, period)
    case "payables":
      return data.payables(ctx)
    case "purchases":
      return data.purchasesSummary(ctx, period)
    case "suppliers":
      return data.suppliersList(ctx, searchTerms(message, ["proveedor", "proveedores", "telefono", "ruc", "contacto", "lista"]))
    case "receivables":
      return data.receivables(ctx)
    case "top_customers":
      return data.topCustomers(ctx, period)
    case "billing":
      return data.billingStatus(ctx, period)
  }
}

function deniedText(ctx: TenantContext, intent: Intent) {
  const need = NEEDS[intent]
  const names = (need?.any ?? []).map((p) => DENIED[p] ?? p).join(" o ")
  return `Tu usuario (${ROLE_LABEL[ctx.role]}) no tiene permiso de ${names} para ver esa información. Si la necesitas, pídele al dueño o al administrador que te dé ese permiso en Configuración → Usuarios.`
}

function allowedIntent(ctx: TenantContext, intent: Intent) {
  const need = NEEDS[intent]
  return !need || need.any.some((p) => has(ctx, p))
}

/* ───────────── Memoria (recuerda / meta / olvida) ───────────── */

function parseAmount(raw: string) {
  const clean = raw.replace(/[^\d.,]/g, "")
  const normalized = clean.includes(",") && !clean.includes(".") ? clean.replace(",", ".") : clean.replace(/,/g, "")
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null
}

async function memoryCommand(ctx: TenantContext, text: string, m: string): Promise<PixReply | null> {
  const base = { links: [], suggestions: [] as string[] }
  const goal = m.match(/\bmi meta (diaria|del dia|de hoy|mensual|del mes|de ventas)?\s*(?:diaria|mensual)?\s*(?:es|sera|de)\s*(?:s\/\.?\s*)?([\d.,]+)/)
  if (goal) {
    const amount = parseAmount(goal[2])
    if (!amount) return null
    const scope = /mensual|del mes/.test(m) ? "month" : "day"
    await setGoal(ctx, amount, scope)
    return { ...base, reply: `Listo: tu meta ${scope === "month" ? "mensual" : "diaria"} de ventas es ${money(amount, ctx.currency)}. Te diré cómo vas cada vez que preguntes por las ventas.`, source: "memory_goal" }
  }
  const note = text.match(/^\s*(?:pix[,:]?\s*)?(?:recuerda|recordar|anota|apunta|guarda)(?:\s+que)?[:,]?\s+(.{3,300})$/i)
  if (note) {
    try {
      await rememberNote(ctx, note[1].trim())
    } catch (error) {
      return { ...base, reply: error instanceof Error ? error.message : "No pude guardarlo.", source: "memory" }
    }
    return { ...base, reply: `Anotado: «${note[1].trim()}». Pregúntame «¿qué recuerdas?» cuando lo necesites.`, source: "memory_note" }
  }
  if (/^(que (recuerdas|tienes anotado|anotaste)|mis notas|que te pedi (recordar|anotar))/.test(m)) {
    const memory = await recall(ctx)
    if (!memory.notes.length && !memory.goal) return { ...base, reply: "Aún no tengo nada anotado. Dime «recuerda que…» para guardar una nota.", source: "memory" }
    const lines = memory.notes.map((n, i) => `${i + 1}. ${n.text}`)
    if (memory.goal) lines.push(`🎯 Meta ${memory.goal.scope === "month" ? "mensual" : "diaria"}: ${money(memory.goal.amount, ctx.currency)}`)
    return { ...base, reply: `**Lo que tengo anotado:**\n${lines.join("\n")}`, source: "memory" }
  }
  if (/^olvida (todo|todas las notas|lo que te dije)$/.test(m)) {
    await forgetAll(ctx)
    return { ...base, reply: "Hecho, borré todas tus notas y tu meta.", source: "memory" }
  }
  const forget = m.match(/^olvida (?:lo de |la nota de |que )?(.{3,})$/)
  if (forget) {
    const n = await forgetMatching(ctx, forget[1].split(" ").filter((w) => w.length > 2))
    return { ...base, reply: n ? `Borré ${n} nota(s).` : "No encontré una nota con esas palabras. Pregúntame «¿qué recuerdas?» para verlas.", source: "memory" }
  }
  return null
}

async function goalLine(ctx: TenantContext, memory: Memory, period: Period) {
  if (!memory.goal) return ""
  const today = parsePeriod("hoy")
  const month = parsePeriod("este mes")
  const target = memory.goal.scope === "month" ? month : today
  if (period.from.getTime() !== target.from.getTime()) return ""
  const own = data.canReports(ctx) ? {} : { userId: ctx.userId }
  const [sales, returns] = await Promise.all([
    prisma.sale.aggregate({ where: { businessId: ctx.businessId, status: "COMPLETED", createdAt: { gte: target.from, lte: target.to }, ...own }, _sum: { total: true } }),
    prisma.saleReturn.aggregate({ where: { businessId: ctx.businessId, createdAt: { gte: target.from, lte: target.to }, ...own }, _sum: { total: true } }),
  ])
  const total = (sales._sum.total ?? 0) - (returns._sum.total ?? 0)
  const progress = (total / memory.goal.amount) * 100
  return progress >= 100
    ? `\n🎯 ¡Meta ${memory.goal.scope === "month" ? "mensual" : "diaria"} cumplida! (${progress.toFixed(0)} % de ${money(memory.goal.amount, ctx.currency)})`
    : `\n🎯 Vas en ${progress.toFixed(0)} % de tu meta ${memory.goal.scope === "month" ? "mensual" : "diaria"} (${money(memory.goal.amount, ctx.currency)}); faltan ${money(memory.goal.amount - total, ctx.currency)}.`
}

/* ───────────── Respuesta principal ───────────── */

function isGreeting(m: string) {
  return /^(hola|holi|holaa+|buenas|buenos dias|buenas tardes|buenas noches|hey|saludos|que tal)( pix)?( [a-z]+)?$/.test(m)
}

function wantsHelp(m: string) {
  return /^(ayuda|help|menu|opciones)$|que (puedes|sabes) hacer|en que (me )?(puedes|podes) ayudar|que te puedo preguntar|que preguntas|como funcionas|que puedo (hacer|ver)|mis permisos|a que tengo acceso/.test(m)
}

function isHowTo(m: string) {
  return /para que (sirve|es|se usa)|que (es|hace) (el |la |los |las )?(modulo|seccion|pantalla|opcion) |como (se (hace|registra|usa|crea|agrega|cambia|abre|cierra|anula|emite|imprime|cobra|pone|sube|descarga|configura|ajusta|transfiere|mueve|vincula|ve)\b|(puedo|hago|registro|creo|agrego|cambio|abro|cierro|anulo|devuelvo|emito|imprimo|cobro|pongo|subo|descargo|hacer|registrar|crear|agregar|cambiar|abrir|cerrar|anular|devolver|emitir|imprimir|cobrar|poner|subir|descargar|usar|configurar|ajustar|transferir|mover|vincular|doy|dar|activo|activar|elimino|eliminar|borro|borrar|veo|ver)\b)|donde (se |puedo |esta |encuentro |veo )|pasos para|explica(me)? (el|la|como)|ensena(me)?/.test(m)
}

function wantsStorePrices(m: string) {
  return /supermercad|plaza ?vea|\bwong\b|\bmetro\b|\btottus\b|\bvivanda\b|competencia|precio (de )?referencia|precios? (en el|del) mercado|cuanto (cuesta|venden|lo venden) (afuera|en otro|en la competencia|en el super)|precio sugerido|a cuanto (lo )?venden|esta caro|estoy caro|mas caro que/.test(m)
}

function wantsCalendar(m: string) {
  return /feriado|fechas? (importantes|comerciales|especiales)|calendario|que fechas (se )?vienen|que (se )?viene (este|el) mes|dia de la madre|dia del padre|fiestas patrias|navidad|gratificacion|\bcts\b|campana (escolar|navidena)|dias? no laborable|halloween|cancion criolla|san valentin/.test(m)
}

function wantsProductData(m: string) {
  return /\bprecio|\bcuesta|\bcuestan|\bvale\b|\bvalen\b|a como (esta|estan|es|son)|\bstock\b|cuant[oa]s? (hay|quedan?|tengo|tenemos)|\bhay\b|quedan?\b|existencia|tenemos|\bcodigo\b|informacion (de|del)|datos (de|del)|que es el producto/.test(m)
}

const BARCODE = /\b(\d{8}|\d{12,14})\b/

export async function answer(ctx: TenantContext, message: string): Promise<PixReply> {
  const text = String(message ?? "").trim().slice(0, 600)
  const m = fold(text)
  const suggestions = suggestionsFor(ctx)
  const reply = (r: ToolResult, source: string, extra = ""): PixReply => ({ reply: r.text + extra, links: r.links ?? [], suggestions: [], source })

  const mem = await memoryCommand(ctx, text, m)
  if (mem) return mem

  if (isGreeting(m)) {
    const name = ctx.userName.split(/\s+/)[0]
    const hour = new Date().getHours()
    const hello = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches"
    return {
      reply: `${hello}, ${name}. Soy ${ASSISTANT_NAME}, tu asistente de Punto Fadey. Respondo con los datos de ${ctx.businessName} (ventas, stock, caja, compras, clientes…), te explico cómo usar cada módulo y busco información útil afuera (precios en supermercados, productos por código de barras, feriados). Solo te muestro lo que tu usuario (${ROLE_LABEL[ctx.role]}) puede ver.\n\nElige una opción o escríbeme tu pregunta.`,
      links: [],
      suggestions,
      source: "greeting",
    }
  }

  if (/quien (eres|te (creo|hizo|desarrollo|programo))|como te llamas|tu creador/.test(m)) {
    return { reply: `Soy ${ASSISTANT_NAME}, la IA de Fadey Solutions dentro de Punto Fadey. Trabajo dentro del sistema de ${ctx.businessName} y solo con los datos de este negocio.`, links: [], suggestions: [], source: "origin" }
  }

  if (wantsHelp(m)) {
    const modules = guidesFor(ctx).map((g) => g.title)
    return {
      reply: [
        `Esto es lo que puedo hacer por ti (${ROLE_LABEL[ctx.role]}):`,
        "- **Datos del negocio:** " + [data.canReports(ctx) || has(ctx, "sell") ? "ventas" : "", "productos más vendidos", "stock y alertas", "vencimientos", has(ctx, "cash") ? "caja" : "", has(ctx, "purchases") ? "compras y proveedores" : "", has(ctx, "customers") ? "clientes y deudas" : "", data.canReports(ctx) ? "márgenes, marcas, horas punta, valor del inventario" : ""].filter(Boolean).join(", ") + ".",
        "- **Guías:** para qué sirve y cómo se usa cada módulo que tienes: " + modules.join(", ") + ".",
        "- **Afuera:** precios de referencia en Plaza Vea, Wong y Metro; datos de un producto por código de barras (Open Food Facts); feriados y fechas comerciales.",
        "- **Memoria:** «recuerda que…», «mi meta diaria es S/ 1500», «¿qué recuerdas?».",
        "",
        "Puedes preguntar con fechas: «ventas de ayer», «más vendidos de octubre», «del 1/11 al 15/11», y luego «¿y la semana pasada?».",
      ].join("\n"),
      links: [],
      suggestions,
      source: "help",
    }
  }

  // Código de barras en la pregunta: catálogo propio + Open Food Facts (y precios afuera si los pide).
  const code = m.match(BARCODE)?.[1]
  if (code) {
    const own = await data.searchProducts(ctx, [], code)
    const parts: string[] = []
    const links: Link[] = []
    if (own.length) {
      const info = await data.productInfo(ctx, own, "both")
      parts.push(`**En tu catálogo:**\n${info.text}`)
      links.push(...(info.links ?? []))
    } else parts.push(`El código ${code} no está en tu catálogo.`)
    let offName = ""
    try {
      const facts = await openFoodFacts(code)
      if (facts) {
        parts.push(foodFactsText(facts))
        const brand = facts.brand.split(",")[0].trim()
        offName = [fold(facts.name).includes(fold(brand)) ? "" : brand, facts.name, facts.quantity].filter(Boolean).join(" ")
      } else parts.push("Open Food Facts no tiene datos de ese código.")
    } catch {
      parts.push("No pude consultar Open Food Facts en este momento.")
    }
    if (wantsStorePrices(m) || /precio/.test(m)) {
      const query = own[0] ? `${own[0].brand?.name ?? ""} ${own[0].name}` : offName
      if (query.trim()) {
        const prices = await supermarketPrices(query).catch(() => ({ results: [], failed: ["Plaza Vea", "Wong", "Metro"], exact: false }))
        parts.push(pricesText(query.trim(), prices, own[0] ? { name: own[0].name, price: own[0].salePrice } : undefined))
      }
    }
    if (!own.length && offName) parts.push(`¿Lo quieres vender? Créalo en Productos y marcas con el nombre «${offName}».`)
    return { reply: parts.join("\n\n"), links, suggestions: [], source: "barcode" }
  }

  if (wantsStorePrices(m)) {
    const terms = searchTerms(sizeNorm(text), ["competencia", "plaza", "vea", "wong", "metro", "tottus", "vivanda", "esta", "caro", "estoy", "barato", "lo", "venden", "afuera", "otro", "otros", "sugerido", "mi", "en", "el"])
    if (!terms.length) return { reply: "Dime qué producto buscar, por ejemplo «precio de aceite Primor 1 L en supermercados».", links: [], suggestions: [], source: "store_prices" }
    const query = terms.join(" ")
    const own = await data.searchProducts(ctx, terms.filter((t) => !/^\d/.test(t)))
    const only = [/plaza ?vea/.test(m) ? "Plaza Vea" : "", /\bwong\b/.test(m) ? "Wong" : "", /\bmetro\b/.test(m) ? "Metro" : ""].filter(Boolean)
    const prices = await supermarketPrices(query, only).catch(() => ({ results: [], failed: ["Plaza Vea", "Wong", "Metro"], exact: false }))
    const ownPrice = own.length === 1 ? { name: own[0].name, price: own[0].salePrice } : undefined
    return { reply: pricesText(query, prices, ownPrice), links: [], suggestions: [], source: "store_prices" }
  }

  if (wantsCalendar(m)) {
    const n = m.match(/(\d{1,3})\s*dias/)
    const days = n ? Math.min(366, Number(n[1])) : /ano|anual/.test(m) ? 366 : /navidad|fin de ano|diciembre/.test(m) ? 60 : 45
    return { reply: calendarText(days), links: [], suggestions: [], source: "calendar" }
  }

  // «¿Cómo hago…?» / «¿Para qué sirve…?» va a la guía del módulo antes que a los datos.
  if (isHowTo(m)) {
    const found = findGuide(ctx, text)
    if (found) {
      if (!found.allowed) return { reply: `Ese módulo (${found.guide.title}) no está habilitado para tu usuario (${ROLE_LABEL[ctx.role]}). Pídeselo al dueño o al administrador si lo necesitas.`, links: [], suggestions: [], source: `guide_denied:${found.guide.id}` }
      return { reply: guideText(found.guide), links: [{ label: `Abrir ${found.guide.title}`, href: found.guide.href }], suggestions: [], source: `guide:${found.guide.id}` }
    }
  }

  // Seguimiento: «¿y ayer?», «y la semana pasada», «¿y en octubre?» repite la última consulta con otra fecha.
  let intent = detectIntent(m)
  const period0 = parsePeriod(text)
  if (!intent && period0.explicit && m.split(" ").length <= 6) {
    const last = LAST_INTENT.get(ctx.userId)
    if (last && Date.now() - last.at < 30 * 60 * 1000) intent = last.intent as Intent
  }

  // Producto concreto: «precio de X», «stock de X», «¿hay X?».
  if ((!intent || intent === "sales") && wantsProductData(m)) {
    const terms = searchTerms(text, ["cuantos", "cuantas", "hay", "quedan", "queda", "tenemos", "tengo", "esta", "estan", "como"])
    if (terms.length) {
      const products = await data.searchProducts(ctx, terms)
      if (products.length) {
        const focus = /precio|cuesta|cuestan|vale|valen|a como/.test(m) && !/stock|hay|quedan?|cuant/.test(m) ? "price" : /stock|hay|quedan?|cuant|existencia/.test(m) && !/precio/.test(m) ? "stock" : "both"
        return reply(await data.productInfo(ctx, products, focus), "product")
      }
      if (!intent) {
        return { reply: `No encontré «${terms.join(" ")}» en tu catálogo. Si es un producto nuevo, puedo buscar su precio de referencia: escribe «precio de ${terms.join(" ")} en supermercados».`, links: [{ label: "Productos y marcas", href: "/productos" }], suggestions: [], source: "product_not_found" }
      }
    }
  }

  // Cliente concreto: «¿cuánto debe Juan Pérez?»
  if ((intent === "receivables" || /cuanto (me )?debe\b|cliente\b/.test(m)) && has(ctx, "customers")) {
    const terms = searchTerms(text, ["debe", "deben", "deuda", "cliente", "clientes", "cuanto", "me", "quien", "quienes", "por", "cobrar", "fiado", "fiados"])
    if (terms.length) {
      const info = await data.customerInfo(ctx, terms)
      if (info) return reply(info, "customer")
    }
  }

  if (intent) {
    if (!allowedIntent(ctx, intent)) return { reply: deniedText(ctx, intent), links: [], suggestions: [], source: `denied:${intent}` }
    const period = PERIOD_INTENTS.has(intent) ? parsePeriod(text, defaultPeriod(intent)) : period0
    LAST_INTENT.set(ctx.userId, { intent, at: Date.now() })
    const result = await runIntent(ctx, intent, text, period)
    let extra = ""
    if (intent === "sales" && !paymentFilter(m)) extra = await goalLine(ctx, await recall(ctx), period)
    return reply(result, intent, extra)
  }

  // Sin intención clara: guía del módulo si la menciona, o un producto del catálogo.
  const found = findGuide(ctx, text)
  if (found) {
    if (!found.allowed) return { reply: `Ese módulo (${found.guide.title}) no está habilitado para tu usuario. Pídeselo al dueño o al administrador si lo necesitas.`, links: [], suggestions: [], source: `guide_denied:${found.guide.id}` }
    return { reply: guideText(found.guide), links: [{ label: `Abrir ${found.guide.title}`, href: found.guide.href }], suggestions: [], source: `guide:${found.guide.id}` }
  }
  const terms = searchTerms(text)
  if (terms.length && terms.length <= 4) {
    const products = await data.searchProducts(ctx, terms)
    if (products.length && products.length <= 3) return reply(await data.productInfo(ctx, products, "both"), "product")
  }
  return {
    reply: "No estoy seguro de qué necesitas. Puedo responder sobre ventas, stock, vencimientos, caja, compras, clientes e informes; explicarte cualquier módulo («¿cómo registro una compra?»), o buscar precios de referencia y datos por código de barras. Prueba con una de estas opciones:",
    links: [],
    suggestions,
    source: "fallback",
  }
}
