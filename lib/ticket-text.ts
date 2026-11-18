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

export function buildTicketText(sale: TicketSale, width: number, document?: TicketDocument) {
  const w = paperChars(width)
  const rule = "-".repeat(w)
  const money = sale.currency === "USD" ? "$" : "S/"
  const out: string[] = []
  out.push(center(sale.businessName.toUpperCase(), w))
  if (sale.legalName && sale.legalName !== sale.businessName) out.push(...wrap(sale.legalName, w).map((line) => center(line, w)))
  if (sale.taxId) out.push(center(`RUC ${sale.taxId}`, w))
  if (sale.address) out.push(...wrap(sale.address, w).map((line) => center(line, w)))
  out.push(rule)
  if (document) {
    out.push(center(document.title.toUpperCase(), w))
    out.push(center(document.number, w))
    out.push(rule)
  } else {
    out.push(center("NOTA DE VENTA", w))
  }
  out.push(`Fecha: ${stamp(sale.createdAt)}`)
  out.push(`Venta: ${sale.code}`)
  out.push(...wrap(`Cajero: ${sale.cashier}`, w))
  const customer = document?.customerName ?? sale.customer
  if (customer) out.push(...wrap(`Cliente: ${customer}`, w))
  if (document?.customerDoc && document.customerDoc !== "-") out.push(`Doc: ${document.customerDoc}`)
  out.push(rule)
  for (const line of sale.lines) {
    out.push(...wrap(line.description, w))
    out.push(pair(`  ${qty(line.quantity)} x ${amount(line.unitPrice)}`, amount(line.total), w))
  }
  out.push(rule)
  if (sale.discount > 0) {
    out.push(pair("Subtotal", `${money} ${amount(sale.subtotal)}`, w))
    out.push(pair("Descuento", `-${money} ${amount(sale.discount)}`, w))
  }
  if (document) {
    out.push(pair("Op. gravada", `${money} ${amount(document.taxable)}`, w))
    out.push(pair(`IGV ${(document.igvRate / 100).toFixed(0)}%`, `${money} ${amount(document.tax)}`, w))
  }
  out.push(pair("TOTAL", `${money} ${amount(sale.total)}`, w))
  for (const payment of sale.payments) out.push(pair(payment.label, `${money} ${amount(payment.amount)}`, w))
  out.push(rule)
  if (sale.voided) out.push(center("*** VENTA ANULADA ***", w))
  if (document) {
    if (document.hash) out.push(...wrap(`Resumen: ${document.hash}`, w))
    out.push(
      ...(document.accepted
        ? wrap(`Representacion impresa de la ${document.title}`, w)
        : wrap("Comprobante aun no aceptado por SUNAT", w)
      ).map((line) => center(line, w)),
    )
  } else {
    out.push(center("Este ticket no es comprobante de pago", w))
  }
  out.push(center("Gracias por su compra", w))
  return out.join("\n")
}
