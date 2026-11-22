import { D } from "@/lib/money"

export const PAPER_CHARS: Record<number, number> = { 58: 32, 80: 48 }

export function paperChars(width: number) {
  return PAPER_CHARS[width] ?? 48
}

function plain(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "")
}

function center(text: string, width: number) {
  const value = plain(text).slice(0, width)
  const pad = Math.max(0, Math.floor((width - value.length) / 2))
  return " ".repeat(pad) + value
}

function pair(left: string, right: string, width: number) {
  const r = plain(right)
  const l = plain(left).slice(0, Math.max(1, width - r.length - 1))
  return l + " ".repeat(Math.max(1, width - l.length - r.length)) + r
}

function wrap(text: string, width: number) {
  const words = plain(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const piece = word.slice(0, width)
    if (!current) current = piece
    else if (current.length + 1 + piece.length <= width) current += ` ${piece}`
    else {
      lines.push(current)
      current = piece
    }
  }
  if (current) lines.push(current)
  return lines
}

function amount(cents: number) {
  return D(cents).div(100).toFixed(2)
}

function qty(value: number) {
  return D(value).div(10000).toDecimalPlaces(4).toString()
}

export type TicketSale = {
  businessName: string
  legalName?: string | null
  taxId?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  /** Desglose por tipo de impuesto (en céntimos). */
  taxes?: { gravada: number; exonerada: number; inafecta: number; igv: number }
  code: string
  createdAt: Date
  cashier: string
  customer?: string | null
  currency: string
  lines: { description: string; quantity: number; unitPrice: number; total: number }[]
  subtotal: number
  discount: number
  total: number
  payments: { label: string; amount: number }[]
  voided?: boolean
}

export type TicketDocument = {
  title: string
  number: string
  customerName: string
  customerDoc?: string | null
  taxable: number
  tax: number
  igvRate: number
  accepted: boolean
  hash?: string | null
}

function stamp(date: Date) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(date)
}

const UNITS = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"]
const TENS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
const HUNDREDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

function under1000(n: number): string {
  if (n === 0) return ""
  if (n === 100) return "CIEN"
  const h = Math.floor(n / 100)
  const rest = n % 100
  const head = HUNDREDS[h]
  let tail = ""
  if (rest < 30) tail = UNITS[rest]
  else tail = TENS[Math.floor(rest / 10)] + (rest % 10 ? ` Y ${UNITS[rest % 10]}` : "")
  return [head, tail].filter(Boolean).join(" ")
}

/** Monto en letras: 200.00 → «DOSCIENTOS Y 00/100 SOLES». */
export function amountInWords(cents: number, currency = "PEN") {
  const whole = Math.floor(Math.abs(cents) / 100)
  const decimals = String(Math.abs(cents) % 100).padStart(2, "0")
  const millions = Math.floor(whole / 1_000_000)
  const thousands = Math.floor((whole % 1_000_000) / 1000)
  const rest = whole % 1000
  const parts: string[] = []
  if (millions) parts.push(millions === 1 ? "UN MILLON" : `${under1000(millions)} MILLONES`)
  if (thousands) parts.push(thousands === 1 ? "MIL" : `${under1000(thousands)} MIL`)
  if (rest) parts.push(under1000(rest))
  const words = (parts.join(" ") || "CERO").replace(/UNO MIL/g, "UN MIL").replace(/UNO MILLONES/g, "UN MILLONES")
  return `${words} Y ${decimals}/100 ${currency === "USD" ? "DOLARES" : "SOLES"}`
}

/** Fila de producto: cantidad, descripción, precio unitario e importe en columnas. */
function itemRows(description: string, quantity: string, unit: string, total: string, w: number) {
  const qtyCol = 6
  const priceCol = w >= 40 ? 9 : 7
  const totalCol = w >= 40 ? 10 : 8
  const descCol = Math.max(8, w - qtyCol - priceCol - totalCol)
  const desc = wrap(description, descCol)
  const rows: string[] = []
  desc.forEach((text, index) => {
    if (index === 0) {
      rows.push(quantity.slice(0, qtyCol - 1).padEnd(qtyCol) + text.padEnd(descCol) + unit.padStart(priceCol) + total.padStart(totalCol))
    } else rows.push(" ".repeat(qtyCol) + text)
  })
  return rows
}

export function buildTicketText(sale: TicketSale, width: number, document?: TicketDocument) {
  const w = paperChars(width)
  const rule = "-".repeat(w)
  const money = sale.currency === "USD" ? "$" : "S/"
  const out: string[] = []
  const centered = (text: string) => wrap(text, w).map((line) => center(line, w))
  // Cabecera centrada: nombre, razón social, dirección, RUC, teléfono y correo.
  out.push(...centered(sale.businessName.toUpperCase()))
  if (sale.legalName && sale.legalName.toUpperCase() !== sale.businessName.toUpperCase()) out.push(...centered(sale.legalName.toUpperCase()))
  if (sale.address) out.push(...centered(sale.address.toUpperCase()))
  if (sale.taxId) out.push(center(`RUC ${sale.taxId}`, w))
  if (sale.phone) out.push(...centered(`Telf: ${sale.phone}`))
  if (sale.email) out.push(...centered(sale.email))
  out.push(rule)
  if (document) {
    out.push(...centered(document.title.toUpperCase()))
    out.push(center(document.number, w))
  } else {
    out.push(center("NOTA DE VENTA", w))
    out.push(center(`N. ${sale.code}`, w))
  }
  out.push(rule)
  // Datos de la venta (etiquetas alineadas).
  // Etiqueta alineada y el valor partido en líneas que respetan la sangría.
  const field = (label: string, value: string) => {
    const head = `${label.padEnd(8)}: `
    const parts = wrap(value || "-", Math.max(8, w - head.length))
    return parts.map((part, index) => (index === 0 ? head : " ".repeat(head.length)) + part)
  }
  out.push(...field("Fecha", stamp(sale.createdAt)))
  const customer = document?.customerName ?? sale.customer
  if (document?.customerDoc && document.customerDoc !== "-") out.push(...field(document.customerDoc.length === 11 ? "R.U.C." : "DNI", document.customerDoc))
  out.push(...field("Cliente", customer || "CLIENTES VARIOS"))
  out.push(...field("Vendedor", sale.cashier))
  out.push(rule)
  // Productos en columnas.
  const priceCol = w >= 40 ? 9 : 7
  const totalCol = w >= 40 ? 10 : 8
  const descCol = Math.max(8, w - 6 - priceCol - totalCol)
  out.push("Cant. " + "Descripcion".padEnd(descCol) + "P.Unit".padStart(priceCol) + "Importe".padStart(totalCol))
  out.push(rule)
  for (const line of sale.lines) out.push(...itemRows(line.description, qty(line.quantity), amount(line.unitPrice), amount(line.total), w))
  out.push(rule)
  if (sale.discount > 0) {
    out.push(pair("Subtotal", `${money} ${amount(sale.subtotal)}`, w))
    out.push(pair("Descuento", `-${money} ${amount(sale.discount)}`, w))
  }
  if (document) {
    const taxes = sale.taxes ?? { gravada: document.taxable, exonerada: 0, inafecta: 0, igv: document.tax }
    out.push(pair("Op. exonerada", `${money} ${amount(taxes.exonerada)}`, w))
    out.push(pair("Op. inafecta", `${money} ${amount(taxes.inafecta)}`, w))
    out.push(pair("Op. gravada", `${money} ${amount(taxes.gravada)}`, w))
    out.push(pair(`I.G.V. ${(document.igvRate / 100).toFixed(0)}%`, `${money} ${amount(taxes.igv)}`, w))
  }
  out.push(pair("TOTAL", `${money} ${amount(sale.total)}`, w))
  out.push(...wrap(`Son: ${amountInWords(sale.total, sale.currency)}`, w))
  out.push(rule)
  for (const payment of sale.payments) out.push(pair(`Pago ${payment.label}`, `${money} ${amount(payment.amount)}`, w))
  if (sale.payments.length) out.push(rule)
  if (sale.voided) out.push(center("*** VENTA ANULADA ***", w))
  if (document) {
    if (document.hash) out.push(...wrap(`Resumen: ${document.hash}`, w))
    out.push(...(document.accepted ? centered(`Representacion impresa de la ${document.title}`) : centered("Comprobante aun no aceptado por SUNAT")))
  } else {
    out.push(...centered("Este ticket no es comprobante de pago"))
  }
  out.push(center("Gracias por su compra", w))
  return out.join("\n")
}
