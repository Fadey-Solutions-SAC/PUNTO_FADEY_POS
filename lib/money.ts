import Decimal from "decimal.js"
import { AppError } from "@/lib/errors"

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

/** Cantidades y factores: 4 decimales. */
export const QTY_SCALE = 10_000
/** Montos: centavos. */
export const MONEY_SCALE = 100

export function D(value: Decimal.Value) {
  return new Decimal(value)
}

export function money(value: Decimal.Value) {
  if (value === "" || value === null || value === undefined) return new Decimal(0)
  let parsed: Decimal
  try {
    parsed = new Decimal(value)
  } catch {
    throw new AppError("Monto inválido")
  }
  if (!parsed.isFinite()) throw new AppError("Monto inválido")
  return parsed.toDecimalPlaces(2)
}

export function qty(value: Decimal.Value) {
  if (value === "" || value === null || value === undefined) throw new AppError("Cantidad inválida")
  let parsed: Decimal
  try {
    parsed = new Decimal(value)
  } catch {
    throw new AppError("Cantidad inválida")
  }
  if (!parsed.isFinite()) throw new AppError("Cantidad inválida")
  return parsed.toDecimalPlaces(4)
}

function assertSafe(value: Decimal, label: string) {
  if (!value.isInteger() || value.gt(Number.MAX_SAFE_INTEGER) || value.lt(-Number.MAX_SAFE_INTEGER)) {
    throw new AppError(`${label} fuera de rango`)
  }
  return value.toNumber()
}

export function toMoneyInt(value: Decimal.Value) {
  const parsed = money(value)
  if (parsed.isNegative()) throw new AppError("El monto no puede ser negativo")
  return assertSafe(parsed.mul(MONEY_SCALE).toDecimalPlaces(0), "Monto")
}

export function toQtyInt(value: Decimal.Value) {
  const parsed = qty(value)
  if (parsed.isNegative()) throw new AppError("La cantidad no puede ser negativa")
  return assertSafe(parsed.mul(QTY_SCALE).toDecimalPlaces(0), "Cantidad")
}

export function toFactorInt(value: Decimal.Value) {
  const parsed = qty(value)
  if (parsed.lte(0)) throw new AppError("El factor de conversión debe ser mayor que cero")
  return assertSafe(parsed.mul(QTY_SCALE).toDecimalPlaces(0), "Factor")
}

export function fromMoneyInt(cents: number) {
  return D(cents).div(MONEY_SCALE)
}

export function fromQtyInt(value: number) {
  return D(value).div(QTY_SCALE)
}

/** a y b están en escala de cantidad. El resultado queda en la misma escala. */
export function mulScale(a: number, b: number) {
  return assertSafe(D(a).mul(b).div(QTY_SCALE).toDecimalPlaces(0), "Cálculo")
}

export function formatMoney(cents: number, currency = "PEN") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(fromMoneyInt(cents).toNumber())
}

export function formatQty(value: number) {
  return fromQtyInt(value).toFixed(4).replace(/\.?0+$/, "")
}

export function percent(part: number, total: number) {
  if (total === 0) return D(0)
  return D(part).mul(100).div(total)
}

/** Porcentaje comercial con dos decimales: 10% se guarda como 1000. */
export function toPercentInt(value: Decimal.Value) {
  let parsed: Decimal
  try {
    parsed = new Decimal(value)
  } catch {
    throw new AppError("Porcentaje inválido")
  }
  if (!parsed.isFinite() || parsed.isNegative() || parsed.gt(100)) {
    throw new AppError("El porcentaje debe estar entre 0 y 100")
  }
  return assertSafe(parsed.mul(100).toDecimalPlaces(0), "Porcentaje")
}

export function fromPercentInt(value: number) {
  return D(value).div(100)
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}
