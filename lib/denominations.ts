/** Denominaciones en soles (Perú) para el conteo rápido de efectivo. */
export const CASH_DENOMS = [
  { key: "b200", label: "S/ 200", value: 200, kind: "bill" as const },
  { key: "b100", label: "S/ 100", value: 100, kind: "bill" as const },
  { key: "b50", label: "S/ 50", value: 50, kind: "bill" as const },
  { key: "b20", label: "S/ 20", value: 20, kind: "bill" as const },
  { key: "b10", label: "S/ 10", value: 10, kind: "bill" as const },
  { key: "m5", label: "S/ 5", value: 5, kind: "coin" as const },
  { key: "m2", label: "S/ 2", value: 2, kind: "coin" as const },
  { key: "m1", label: "S/ 1", value: 1, kind: "coin" as const },
  { key: "c50", label: "S/ 0.50", value: 0.5, kind: "coin" as const },
  { key: "c20", label: "S/ 0.20", value: 0.2, kind: "coin" as const },
  { key: "c10", label: "S/ 0.10", value: 0.1, kind: "coin" as const },
] as const

export type DenomKey = (typeof CASH_DENOMS)[number]["key"]

export function emptyDenominations(): Record<DenomKey, string> {
  return Object.fromEntries(CASH_DENOMS.map((item) => [item.key, ""])) as Record<DenomKey, string>
}

/** Total en céntimos (escala money int) a partir del conteo por denominación. */
export function denomTotalCents(counts: Record<string, string>) {
  let soles = 0
  for (const item of CASH_DENOMS) {
    const qty = Math.max(0, Math.floor(Number(counts[item.key] || 0)))
    if (!Number.isFinite(qty)) continue
    soles += qty * item.value
  }
  return Math.round(soles * 100)
}
