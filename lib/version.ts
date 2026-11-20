/**
 * Versión de producto Punto Fadey: cuatro dígitos 0–9 (A.B.C.D).
 *
 * En cada actualización se avanza el último dígito.
 * Al pasar de 9, ese dígito vuelve a 0 y se incrementa el de la izquierda.
 *
 * Ejemplos: 1.0.2.3 → 1.0.2.4 → … → 1.0.2.9 → 1.0.3.0
 *           1.0.9.9 → 1.1.0.0 → 1.1.0.1 → … → 1.1.0.9 → 1.1.1.0
 */
export const APP_VERSION = "1.0.4.1"

export function formatAppVersion(version = APP_VERSION) {
  return `v${version}`
}

/** Avanza A.B.C.D con acarreo en base 10 por segmento (máx. 9). */
export function bumpAppVersion(version = APP_VERSION) {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 9)) {
    throw new Error(`Versión inválida: ${version}`)
  }
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i] < 9) {
      parts[i] += 1
      break
    }
    parts[i] = 0
    if (i === 0) {
      throw new Error("Se alcanzó el tope de versión 9.9.9.9")
    }
  }
  return parts.join(".")
}
