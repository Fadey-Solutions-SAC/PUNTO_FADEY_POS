
const ORIGIN_KEY = "fadey_local_assistant"
const PREFS_KEY = "fadey_print_prefs"
const HOSTS = ["127.0.0.1", "localhost"]
const PORTS = Array.from({ length: 24 }, (_, index) => 3002 + index)
const EFACT_BOT = ["http://127.0.0.1:8765", "http://localhost:8765"]

export const ASSISTANT_DOWNLOAD_URL =
  (import.meta.env.VITE_ASSISTANT_DOWNLOAD_URL as string | undefined) ||
  "https://github.com/Fadey-Solutions-SAC/RESTO_FADEY_POS/releases/latest/download/Fadey.Impresion.Setup.exe"

/** El asistente (programa Resto FADEY) se pone «en espera» y cierra sus puertos cuando Resto Fadey no tiene usuarios. */
export const ASSISTANT_HELP =
  "No se encontró el asistente en esta PC. Si el ícono de Resto FADEY junto al reloj dice «en espera», haz clic derecho sobre él y elige «Reintentar servicio de impresión»."

export type PrintPrefs = { autoPrint: boolean; paperWidth: 58 | 80 }

export type PrintPayload = {
  text: string
  preformatted: true
  paperWidth: 58 | 80
  anchoPapel: 58 | 80
  restaurantBrand?: string
  logoUrl?: string
  footerImageUrl?: string
  footerImageMaxDots?: number
}

export function readPrefs(): PrintPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<PrintPrefs>
    return { autoPrint: raw.autoPrint !== false, paperWidth: raw.paperWidth === 58 ? 58 : 80 }
  } catch {
    return { autoPrint: true, paperWidth: 80 }
  }
}

export function savePrefs(prefs: PrintPrefs) {
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

export function savedOrigin() {
  return window.localStorage.getItem(ORIGIN_KEY) ?? ""
}

export function saveOrigin(origin: string) {
  const value = origin.trim().replace(/\/$/, "")
  if (value) window.localStorage.setItem(ORIGIN_KEY, value)
  else window.localStorage.removeItem(ORIGIN_KEY)
}

async function getJson(url: string, timeout = 2500) {
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeout) })
  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  return { ok: response.ok, data }
}

export async function probe(origin: string) {
  const base = origin.trim().replace(/\/$/, "")
  if (!/^https?:\/\/[^/]+$/i.test(base)) return false
  for (const path of ["/api/health", "/health"]) {
    try {
      const { ok, data } = await getJson(`${base}${path}`)
      const row = data as { status?: string; mode?: string } | null
      if (ok && row?.status === "ok" && row.mode === "assistant") return true
    } catch {
      continue
    }
  }
  return false
}

export async function discover() {
  const saved = savedOrigin()
  if (saved && (await probe(saved))) return saved
  const candidates = PORTS.flatMap((port) => HOSTS.map((host) => `http://${host}:${port}`))
  const found = await Promise.all(candidates.map(async (origin) => ((await probe(origin)) ? origin : "")))
  const origin = found.find(Boolean) ?? ""
  if (origin) saveOrigin(origin)
  return origin
}

async function assistant() {
  const origin = await discover()
  if (!origin) throw new Error(ASSISTANT_HELP)
  return origin
}

async function send(path: string, init: RequestInit = {}, timeout = 20000) {
  const origin = await assistant()
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeout),
  })
  const text = await response.text()
  let data: Record<string, unknown> | null = null
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    data = null
  }
  if (!response.ok) throw new Error(String(data?.error ?? "El asistente no pudo completar la operación"))
  return data
}

export async function listPrinters() {
  const data = (await send("/api/printers")) as unknown
  const rows = Array.isArray(data) ? data : []
  return rows
    .map((row) => (typeof row === "string" ? row : String((row as { name?: string })?.name ?? "")))
    .filter(Boolean)
}

/**
 * El asistente es compartido con Resto Fadey (módulos «caja», «cocina», «bar»).
 * Punto Fadey guarda y usa su propio módulo «punto» para no cambiar la configuración de Resto.
 * Mientras «punto» no exista, imprime con la impresora de «caja» sin modificarla.
 */
export const PRINT_MODULE = "punto"
const FALLBACK_MODULE = "caja"

type ModuleConfig = { nombre?: string; anchoPapel?: number; paperWidth?: number; tipo?: string; ip?: string; puerto?: number }

async function readPrintingConfig() {
  return ((await send("/api/printing/config")) ?? {}) as Record<string, ModuleConfig | undefined>
}

function configured(cfg: ModuleConfig | undefined) {
  return Boolean(cfg && (cfg.tipo === "red" ? cfg.ip : cfg.nombre))
}

/** Módulo con el que imprime Punto Fadey: el propio si ya se configuró; si no, el de caja (solo lectura). */
async function activeModule() {
  const all = await readPrintingConfig()
  return configured(all[PRINT_MODULE]) ? PRINT_MODULE : FALLBACK_MODULE
}

export async function readCashierPrinter() {
  const all = await readPrintingConfig()
  const own = configured(all[PRINT_MODULE])
  const cfg = (own ? all[PRINT_MODULE] : all[FALLBACK_MODULE]) ?? {}
  return {
    tipo: cfg.tipo === "red" ? "red" : "usb",
    nombre: cfg.nombre ?? "",
    ip: cfg.ip ?? "",
    puerto: cfg.puerto ?? 9100,
    paperWidth: (cfg.anchoPapel ?? cfg.paperWidth) === 58 ? 58 : 80,
    /** false = todavía usa la impresora de caja de Resto Fadey. */
    own,
  } as const
}

export async function saveCashierPrinter(input: { tipo: "usb" | "red"; nombre: string; ip: string; puerto: number; paperWidth: 58 | 80 }) {
  // Solo se envía el módulo «punto»: el asistente lo une a lo existente sin tocar caja/cocina/bar de Resto.
  await send("/api/printing/config", {
    method: "PUT",
    body: JSON.stringify({
      [PRINT_MODULE]: {
        tipo: input.tipo,
        nombre: input.nombre,
        ip: input.ip,
        puerto: input.puerto || 9100,
        paperWidth: input.paperWidth,
        anchoPapel: input.paperWidth,
        autoPrint: true,
        confirmPrint: false,
      },
    }),
  })
}

export async function printerStatus() {
  const data = (await send(`/api/printing/status/${await activeModule()}`)) as { connected?: boolean; status?: string } | null
  return { connected: data?.connected === true, label: String(data?.status ?? "") }
}

export async function testPrint() {
  await send(`/api/printing/test/${await activeModule()}`, { method: "POST", body: "{}" })
}

function absolute(url: string | null | undefined) {
  if (!url) return undefined
  return new URL(url, window.location.origin).toString()
}

/** Ancho del papel de la ticketera configurada en el asistente (58 u 80 mm); si no responde, el guardado aquí. */
export async function printerPaperWidth(): Promise<58 | 80> {
  try {
    const all = await readPrintingConfig()
    const cfg = configured(all[PRINT_MODULE]) ? all[PRINT_MODULE] : all[FALLBACK_MODULE]
    const width = cfg?.anchoPapel ?? cfg?.paperWidth
    if (width === 58 || width === 80) return width
  } catch {
    /* sin asistente: se usa la preferencia */
  }
  return readPrefs().paperWidth
}

export async function printText(text: string, options: { brand?: string; logo?: string | null; qrDataUrl?: string; paperWidth?: 58 | 80 } = {}) {
  const width = options.paperWidth ?? readPrefs().paperWidth
  const payload: PrintPayload = {
    text,
    preformatted: true,
    paperWidth: width,
    anchoPapel: width,
    restaurantBrand: options.brand,
    logoUrl: absolute(options.logo),
    ...(options.qrDataUrl ? { footerImageUrl: options.qrDataUrl, footerImageMaxDots: width === 58 ? 240 : 320 } : {}),
  }
  await send(`/api/printing/print/${await activeModule()}`, { method: "POST", body: JSON.stringify(payload) }, 30000)
}

export async function efactReachable() {
  for (const base of EFACT_BOT) {
    try {
      const { ok } = await getJson(`${base}/health`, 2000)
      if (ok) return true
    } catch {
      continue
    }
  }
  const origin = await discover()
  return Boolean(origin)
}

export async function emitWithLocalBot(sale: unknown) {
  const body = JSON.stringify(sale)
  const origin = await discover()
  const targets = [...EFACT_BOT.map((base) => `${base}/emitir`), ...(origin ? [`${origin}/api/efact/emitir`] : [])]
  let lastError = "No se encontró el servicio de facturación del asistente en esta PC"
  for (const url of targets) {
    let response: Response
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        signal: AbortSignal.timeout(70000),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        lastError = "El asistente tardó demasiado en responder. Revisa el comprobante antes de reintentar."
        break
      }
      continue
    }
    if (response.status === 404) continue
    const text = await response.text()
    try {
      return (text ? JSON.parse(text) : {}) as Record<string, unknown>
    } catch {
      return { ok: false, mensaje: `Respuesta no válida del asistente (${response.status})` }
    }
  }
  throw new Error(lastError)
}
