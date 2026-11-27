/**
 * Acciones de PIX que cambian datos del sistema. Nunca se aplican directo: PIX muestra qué va a cambiar
 * y espera que el usuario pulse «Aplicar». Usan las mismas funciones (y permisos) que las pantallas:
 * - Plantilla de productos (Productos y marcas) → `readProductSheet` / `applyProductSheet`.
 * - Plantilla de stock (Almacenes) → `readStockSheet` / `applyStockSheet`.
 * - Precio de venta y stock mínimo de un producto → `saveProduct`.
 */
import { randomUUID } from "node:crypto"
import ExcelJS from "exceljs"
import { getProductForm, saveProduct } from "@/lib/catalog"
import { prisma } from "@/lib/db"
import { applyProductSheet, readProductSheet } from "@/lib/product-sheet"
import { can } from "@/lib/roles"
import { applyStockSheet, readStockSheet } from "@/lib/stock-sheet"
import type { TenantContext } from "@/lib/types"
import { searchProducts, type Link } from "@/lib/pix/data"
import { fold, money, qtyText, searchTerms } from "@/lib/pix/text"

export type PixAction = { id: string; label: string }

type Pending =
  | { kind: "product_sheet"; file: Buffer; fileName: string }
  | { kind: "stock_sheet"; file: Buffer; fileName: string }
  | { kind: "price"; productId: string; productName: string; cents: number }
  | { kind: "min_stock"; productId: string; productName: string; qty: string }

type Entry = Pending & { userId: string; businessId: string; expires: number }

const PENDING = new Map<string, Entry>()
const TTL = 30 * 60 * 1000

function keep(ctx: TenantContext, pending: Pending) {
  for (const [id, entry] of PENDING) if (entry.expires < Date.now()) PENDING.delete(id)
  const id = randomUUID()
  PENDING.set(id, { ...pending, userId: ctx.userId, businessId: ctx.businessId, expires: Date.now() + TTL } as Entry)
  return id
}

export function isPending(id: string) {
  const entry = PENDING.get(id)
  return Boolean(entry && entry.expires >= Date.now())
}

export type ActionReply = { reply: string; links: Link[]; source: string; action?: PixAction }

const has = (ctx: TenantContext, permission: Parameters<typeof can>[1]) => can(ctx.role, permission, ctx.grants)

/* ───────────── Entregar plantillas ───────────── */

export function templateRequest(ctx: TenantContext, m: string): ActionReply | null {
  if (!/plantilla|excel|formato (de|para) (carga|subir|productos|stock)/.test(m)) return null
  if (!/(dame|da me|entrega|descarga|bajar|baja|pasame|envia|manda|quiero|necesito|genera|obtener|donde (esta|consigo)|como (subo|cargo|uso|lleno)|plantilla de)/.test(m) && !/^plantillas?\b/.test(m)) return null
  const wantsStock = /stock|almacen|cantidades|inventario/.test(m)
  const wantsProducts = /producto|precio|catalogo|marca/.test(m)
  const links: Link[] = []
  const lines: string[] = []
  if ((wantsProducts || !wantsStock) && has(ctx, "catalogWrite")) {
    links.push({ label: "Descargar plantilla de productos", href: "/api/catalog/product-sheet", download: true })
    lines.push("- **Productos:** todos tus productos con marca, unidad, costo, precio, mínimo e impuesto, y filas vacías para agregar nuevos.")
  }
  if ((wantsStock || !wantsProducts) && has(ctx, "adjust")) {
    links.push({ label: "Descargar plantilla de stock", href: "/api/inventory/stock-sheet", download: true })
    lines.push("- **Stock:** cada producto con una columna amarilla por almacén para poner la cantidad real.")
  }
  if (!links.length) {
    return { reply: "Tu usuario no tiene permiso para cargar plantillas (se necesita «Editar catálogo» para productos o «Ajustes de stock» para el stock).", links: [], source: "template_denied" }
  }
  return {
    reply: [
      "Aquí tienes la plantilla:",
      ...lines,
      "",
      "1. Descárgala y ábrela en Excel.",
      "2. Cambia solo lo que necesites (no borres la columna ID ni los encabezados).",
      "3. Súbela aquí con el clip 📎. Te muestro lo que va a cambiar y lo aplico cuando pulses **Aplicar cambios**.",
    ].join("\n"),
    links,
    source: "template",
  }
}

/* ───────────── Archivo subido al chat ───────────── */

async function sheetKind(file: Buffer): Promise<"product_sheet" | "stock_sheet"> {
  const book = new ExcelJS.Workbook()
  try {
    await book.xlsx.load(file as unknown as ArrayBuffer)
  } catch {
    throw new Error("No pude leer el archivo. Sube la plantilla en formato Excel (.xlsx).")
  }
  const sheet = book.worksheets[0]
  if (!sheet) throw new Error("El archivo no tiene hojas.")
  const name = fold(sheet.name)
  if (name === "stock") return "stock_sheet"
  if (name === "productos") return "product_sheet"
  const headers: string[] = []
  sheet.getRow(1).eachCell((cell) => headers.push(fold(String(cell.text ?? ""))))
  return headers.some((h) => h.startsWith("stock ") && h !== "stock total" && !h.startsWith("stock inicial")) ? "stock_sheet" : "product_sheet"
}

export async function previewFile(ctx: TenantContext, file: Buffer, fileName: string): Promise<ActionReply> {
  if (!/\.xlsx$/i.test(fileName)) return { reply: "Por ahora recibo las plantillas en Excel (.xlsx) de Productos o de Stock. Pídeme «dame la plantilla de productos» si no la tienes.", links: [], source: "file_rejected" }
  const kind = await sheetKind(file)
  if (kind === "product_sheet") {
    if (!has(ctx, "catalogWrite")) return { reply: "Tu usuario no tiene permiso de «Editar catálogo» para cargar la plantilla de productos.", links: [], source: "file_denied" }
    const read = await readProductSheet(ctx, file)
    const created = read.rows.filter((r) => r.kind === "new")
    const updated = read.rows.filter((r) => r.kind === "update")
    const lines = [`**Plantilla de productos** «${fileName}» — revisé ${read.total} producto(s).`]
    if (created.length) lines.push("", `**Nuevos (${created.length}):**`, ...created.slice(0, 10).map((r) => `- ${r.values.name}${r.values.price ? ` · S/ ${Number(r.values.price.replace(",", ".")).toFixed(2)}` : ""}${r.values.brand ? ` · ${r.values.brand}` : ""}`), created.length > 10 ? `…y ${created.length - 10} más.` : "")
    if (updated.length) lines.push("", `**Con cambios (${updated.length}):**`, ...updated.slice(0, 10).map((r) => `- ${r.name}: ${r.changes.join(" · ")}`), updated.length > 10 ? `…y ${updated.length - 10} más.` : "")
    if (read.errors.length) lines.push("", `**No se cargarán (${read.errors.length}):**`, ...read.errors.slice(0, 8).map((e) => `- ${e}`), read.errors.length > 8 ? `…y ${read.errors.length - 8} más.` : "")
    if (!read.rows.length) {
      lines.push("", "No hay nada nuevo ni modificado para guardar.")
      return { reply: lines.filter((l, i, a) => l || a[i - 1]).join("\n"), links: [], source: "product_sheet_preview" }
    }
    lines.push("", "Pulsa **Aplicar cambios** para guardarlo, o Cancelar.")
    const id = keep(ctx, { kind, file, fileName })
    return { reply: lines.filter((l, i, a) => l || a[i - 1]).join("\n"), links: [], source: "product_sheet_preview", action: { id, label: `Aplicar cambios (${read.rows.length})` } }
  }
  if (!has(ctx, "adjust")) return { reply: "Tu usuario no tiene permiso de «Ajustes de stock» para cargar la plantilla de stock.", links: [], source: "file_denied" }
  const read = await readStockSheet(ctx, file)
  const lines = [`**Plantilla de stock** «${fileName}» — ${read.rows} producto(s) revisados.`]
  if (read.changes.length) lines.push("", `**Ajustes (${read.changes.length}):**`, ...read.changes.slice(0, 12).map((c) => `- ${c.product} · ${c.warehouse}: ${c.current} → **${c.next}** ${c.unit} (${c.diff})`), read.changes.length > 12 ? `…y ${read.changes.length - 12} más.` : "")
  if (read.errors.length) lines.push("", `**No se cargarán (${read.errors.length}):**`, ...read.errors.slice(0, 8).map((e) => `- ${e}`))
  if (!read.changes.length) {
    lines.push("", "Las cantidades son iguales al stock actual: no hay nada que ajustar.")
    return { reply: lines.join("\n"), links: [], source: "stock_sheet_preview" }
  }
  lines.push("", "Cada ajuste queda en el kardex como «Ajuste por plantilla de stock». Pulsa **Aplicar cambios** para hacerlo, o Cancelar.")
  const id = keep(ctx, { kind, file, fileName })
  return { reply: lines.filter((l, i, a) => l || a[i - 1]).join("\n"), links: [], source: "stock_sheet_preview", action: { id, label: `Aplicar ${read.changes.length} ajuste(s)` } }
}

/* ───────────── Cambios por texto: precio y stock mínimo ───────────── */

function amount(raw: string) {
  const value = Number(raw.replace(",", "."))
  return Number.isFinite(value) && value >= 0 ? value : null
}

export async function textAction(ctx: TenantContext, text: string, m: string): Promise<ActionReply | null> {
  const price = m.match(/^(?:pix )?(?:cambia|cambiar|pon|poner|sube|subir|baja|bajar|actualiza|actualizar|modifica|modificar|ajusta|ajustar)(?:le)? (?:el )?precio(?: de venta)? (?:de |del |de la |a )?(.+?) (?:a|en|por) (?:s\/ ?)?(\d+(?:[.,]\d{1,2})?)(?: soles)?$/)
  const min = m.match(/^(?:pix )?(?:cambia|cambiar|pon|poner|sube|subir|baja|bajar|actualiza|actualizar|modifica|modificar|ajusta|ajustar)(?:le)? (?:el )?(?:stock )?minimo (?:de |del |de la |a )?(.+?) (?:a|en) (\d+(?:[.,]\d{1,3})?)(?: \w+)?$/)
  if (!price && !min) return null
  const isPrice = Boolean(price)
  const [, what, raw] = (price ?? min)!
  const value = amount(raw)
  if (value == null) return null
  if (isPrice && !(has(ctx, "priceWrite") && has(ctx, "catalogWrite"))) return { reply: "Tu usuario no tiene permiso de «Modificar precios».", links: [], source: "price_denied" }
  if (!isPrice && !has(ctx, "catalogWrite")) return { reply: "Tu usuario no tiene permiso de «Editar catálogo» para cambiar el stock mínimo.", links: [], source: "min_denied" }
  const terms = searchTerms(what)
  const products = terms.length ? await searchProducts(ctx, terms) : []
  if (!products.length) return { reply: `No encontré «${what}» en tu catálogo. Escribe el nombre como aparece en Productos y marcas.`, links: [{ label: "Productos y marcas", href: "/productos" }], source: "action_not_found" }
  if (products.length > 1) {
    return {
      reply: [`Encontré ${products.length} productos con «${what}». ¿Cuál es?`, ...products.slice(0, 8).map((p) => `- ${p.name}${p.brand ? ` (${p.brand.name})` : ""}`), "", `Repite la orden con el nombre completo, por ejemplo «cambia el precio de ${products[0].name.toLowerCase()} a ${raw}».`].join("\n"),
      links: [],
      source: "action_ambiguous",
    }
  }
  const product = products[0]
  if (isPrice) {
    const cents = Math.round(value * 100)
    if (cents <= 0) return { reply: "El precio debe ser mayor que cero.", links: [], source: "price_invalid" }
    const warn = cents < product.costPrice ? `\n⚠️ Queda por debajo del costo (${money(product.costPrice, ctx.currency)}).` : ""
    const id = keep(ctx, { kind: "price", productId: product.id, productName: product.name, cents })
    return {
      reply: `Voy a cambiar el precio de venta de **${product.name}**: ${money(product.salePrice, ctx.currency)} → **${money(cents, ctx.currency)}**.${warn}\n\nPulsa **Aplicar** para guardarlo.`,
      links: [],
      source: "price_preview",
      action: { id, label: "Aplicar nuevo precio" },
    }
  }
  const id = keep(ctx, { kind: "min_stock", productId: product.id, productName: product.name, qty: String(value) })
  return {
    reply: `Voy a cambiar el stock mínimo de **${product.name}**: ${qtyText(product.minStock)} → **${String(value).replace(".", ",")} ${product.baseUnit.symbol}**.\n\nPulsa **Aplicar** para guardarlo.`,
    links: [],
    source: "min_preview",
    action: { id, label: "Aplicar stock mínimo" },
  }
}

/* ───────────── Aplicar o cancelar ───────────── */

export function cancelAction(ctx: TenantContext, id: string) {
  const entry = PENDING.get(id)
  if (entry && entry.userId === ctx.userId && entry.businessId === ctx.businessId) PENDING.delete(id)
  return { reply: "Listo, no cambié nada.", links: [] as Link[], source: "action_cancelled" }
}

export async function runAction(ctx: TenantContext, id: string): Promise<ActionReply> {
  const entry = PENDING.get(id)
  if (!entry || entry.userId !== ctx.userId || entry.businessId !== ctx.businessId || entry.expires < Date.now()) {
    PENDING.delete(id)
    return { reply: "Esa acción ya no está disponible (se aplicó, se canceló o pasaron más de 30 minutos). Vuelve a pedírmela o a subir el archivo.", links: [], source: "action_expired" }
  }
  PENDING.delete(id)
  const audit = (action: string, entity: string, detail: string, entityId?: string) =>
    prisma.auditLog.create({ data: { businessId: ctx.businessId, userId: ctx.userId, action, entity, entityId, detail: `${detail} (vía PIX)` } }).catch(() => undefined)

  if (entry.kind === "product_sheet") {
    const result = await applyProductSheet(ctx, entry.file)
    if (result.created || result.updated) await audit("catalog.import", "Product", `Plantilla: ${result.created} nuevos · ${result.updated} actualizados`)
    const lines = [`✅ Plantilla de productos aplicada: **${result.created}** nuevo(s) y **${result.updated}** actualizado(s).`]
    if (result.failed.length) lines.push("", `No se pudieron guardar (${result.failed.length}):`, ...result.failed.slice(0, 8).map((f) => `- ${f}`))
    return { reply: lines.join("\n"), links: [{ label: "Productos y marcas", href: "/productos" }], source: "product_sheet_applied" }
  }
  if (entry.kind === "stock_sheet") {
    const result = await applyStockSheet(ctx, entry.file)
    const lines = [`✅ Stock ajustado en **${result.applied}** producto(s)/almacén. Cada ajuste quedó en el kardex.`]
    if (result.failed.length) lines.push("", `No se pudieron ajustar (${result.failed.length}):`, ...result.failed.slice(0, 8).map((f) => `- ${f}`))
    return { reply: lines.join("\n"), links: [{ label: "Almacenes", href: "/inventario/almacenes" }], source: "stock_sheet_applied" }
  }
  const { values: current } = await getProductForm(ctx, entry.productId)
  const base = { ...current, categoryId: current.categoryId || undefined, maxStock: current.maxStock || undefined }
  if (entry.kind === "price") {
    await saveProduct(ctx, { ...base, salePrice: (entry.cents / 100).toFixed(2) })
    await audit("product.price", "Product", `${entry.productName}: precio ${current.salePrice} → ${(entry.cents / 100).toFixed(2)}`, entry.productId)
    return { reply: `✅ Precio de **${entry.productName}** actualizado a **${money(entry.cents, ctx.currency)}**.`, links: [{ label: "Productos y marcas", href: "/productos" }], source: "price_applied" }
  }
  await saveProduct(ctx, { ...base, minStock: entry.qty })
  await audit("product.minStock", "Product", `${entry.productName}: mínimo ${current.minStock} → ${entry.qty}`, entry.productId)
  return { reply: `✅ Stock mínimo de **${entry.productName}** actualizado a **${entry.qty.replace(".", ",")}**.`, links: [{ label: "Alertas de stock", href: "/inventario/alertas" }], source: "min_applied" }
}
