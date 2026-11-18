import { AppError } from "@/lib/errors"

const BASE = "https://api.decolecta.com/v1"

export type PadronResult = { docType: "1" | "6"; document: string; name: string; address: string }

function token() {
  return (process.env.PERU_CONSULTAS_TOKEN || process.env.DECOLECTA_API_KEY || "").trim()
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function unwrap(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== "object") return {}
  const row = json as Record<string, unknown>
  for (const key of ["data", "resultado", "result"]) {
    if (row[key] && typeof row[key] === "object") return row[key] as Record<string, unknown>
  }
  return row
}

async function fetchPadron(url: string, key: string) {
  const headers = { Accept: "application/json", Authorization: `Bearer ${key}` }
  let response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) })
  if (response.status === 401 || response.status === 403) {
    response = await fetch(`${url}&token=${encodeURIComponent(key)}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000) })
  }
  if (response.status === 404) throw new AppError("No se encontró ese documento en el padrón")
  if (response.status === 401 || response.status === 403) throw new AppError("El token de Decolecta no es válido")
  if (!response.ok) throw new AppError("La consulta del padrón no respondió. Escribe los datos a mano")
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (json?.success === false) throw new AppError(text(json.message) || "No se encontró ese documento en el padrón")
  return unwrap(json)
}

export async function lookupPadron(rawDocument: string): Promise<PadronResult> {
  const key = token()
  if (!key) throw new AppError("La búsqueda no está configurada. Define PERU_CONSULTAS_TOKEN con el token de Decolecta")
  const document = rawDocument.replace(/\D/g, "")
  if (document.length === 11) {
    const row = await fetchPadron(`${BASE}/sunat/ruc?numero=${document}`, key)
    const name = text(row.razon_social) || text(row.razonSocial) || text(row.nombre_o_razon_social) || text(row.nombre)
    if (!name) throw new AppError("El padrón no devolvió la razón social")
    const address = text(row.direccion) || text(row.direccion_completa) || text(row.domicilio_fiscal)
    return { docType: "6", document, name, address }
  }
  if (document.length === 8) {
    const row = await fetchPadron(`${BASE}/reniec/dni?numero=${document}`, key)
    const parts = [row.first_name ?? row.nombres, row.first_last_name ?? row.apellido_paterno, row.second_last_name ?? row.apellido_materno]
    const name = text(row.full_name) || parts.map(text).filter(Boolean).join(" ") || text(row.nombre_completo)
    if (!name) throw new AppError("El padrón no devolvió el nombre")
    return { docType: "1", document, name, address: text(row.direccion) }
  }
  throw new AppError("Escribe un DNI de 8 dígitos o un RUC de 11")
}
