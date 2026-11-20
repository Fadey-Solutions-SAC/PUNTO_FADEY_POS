/**
 * Ventas en espera: el carrito se guarda en este equipo para atender a otro cliente y retomarlo
 * después. No toca stock ni caja hasta que se cobra. Funciona también sin conexión.
 */
import type { SaleCustomer, SaleProduct } from "./api"

const KEY = "pf-parked-sales-v1"
export const PARKED_EVENT = "pf-parked-change"
const MAX = 20

export type ParkedLine = SaleProduct & { quantity: number; key: string }

export type ParkedSale = {
  id: string
  label: string
  createdAt: string
  lines: ParkedLine[]
  customer: SaleCustomer | null
  discount: string
  discountMode: "money" | "percent"
  totalCents: number
}

function read(): ParkedSale[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as ParkedSale[]
  } catch {
    return []
  }
}

function write(items: ParkedSale[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX)))
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
  window.dispatchEvent(new Event(PARKED_EVENT))
}

export function listParked() {
  return read()
}

export function parkSale(sale: Omit<ParkedSale, "id" | "createdAt" | "label"> & { label?: string }) {
  const items = read()
  const createdAt = new Date()
  const time = createdAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
  const label = sale.label?.trim() || sale.customer?.name || `Cliente ${items.length + 1}`
  const parked: ParkedSale = { ...sale, id: crypto.randomUUID(), createdAt: createdAt.toISOString(), label: `${label} · ${time}` }
  write([...items, parked])
  return parked
}

/** Saca la venta de la lista y la devuelve para cargarla en el carrito. */
export function takeParked(id: string) {
  const items = read()
  const found = items.find((item) => item.id === id) ?? null
  write(items.filter((item) => item.id !== id))
  return found
}

export function dropParked(id: string) {
  write(read().filter((item) => item.id !== id))
}
