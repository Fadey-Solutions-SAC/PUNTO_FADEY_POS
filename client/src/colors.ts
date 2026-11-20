/** Paleta compartida: colores vivos con buen contraste sobre blanco. */
export const PALETTE = [
  "#0d9488", // teal
  "#6366f1", // índigo
  "#f59e0b", // ámbar
  "#ec4899", // rosa
  "#0ea5e9", // celeste
  "#8b5cf6", // violeta
  "#10b981", // esmeralda
  "#ef4444", // rojo
]

/** Un color por medio de pago; los códigos propios del negocio toman uno de la paleta. */
const PAY: Record<string, string> = {
  CASH: "#10b981",
  CARD: "#6366f1",
  TRANSFER: "#f59e0b",
  CREDIT: "#0ea5e9",
  OTHER: "#ec4899",
  YAPE: "#8b5cf6",
  PLIN: "#06b6d4",
}

function hashIndex(text: string) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h % PALETTE.length
}

export function payColor(code: string) {
  return PAY[code.toUpperCase()] ?? PALETTE[hashIndex(code)]
}

/** Color estable para una categoría (por id), igual en cada carga. */
export function categoryColor(id: string | null | undefined) {
  if (!id) return "#64748b"
  return PALETTE[hashIndex(id)]
}

/** Fondo suave a partir de un color hex. */
export function tint(hex: string, alpha = 0.12) {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
