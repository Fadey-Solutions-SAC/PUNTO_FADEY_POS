/**
 * Impresión en ticketera y emisión SUNAT con el asistente local (Fadey Impresión),
 * igual que en la versión anterior del sistema y en Resto Fadey.
 */
import {
  getDocumentTicket,
  getSaleTicket,
  prepareAssistantEmit,
  releaseAssistantEmit,
  saveAssistantEmitResult,
} from "./api"
import { ASSISTANT_HELP, efactReachable, emitWithLocalBot, printText, readPrefs } from "./lib/local-assistant"
import { qrDataUrl } from "./lib/qr-image"

export async function printSaleTicket(saleId: string) {
  const prefs = readPrefs()
  const ticket = await getSaleTicket(saleId, prefs.paperWidth)
  await printText(ticket.text, { brand: ticket.brand, logo: ticket.logo, paperWidth: prefs.paperWidth })
}

export async function printDocumentTicket(documentId: string) {
  const prefs = readPrefs()
  const ticket = await getDocumentTicket(documentId, prefs.paperWidth)
  await printText(ticket.text, {
    brand: ticket.brand,
    logo: ticket.logo,
    paperWidth: prefs.paperWidth,
    qrDataUrl: ticket.qr ? qrDataUrl(ticket.qr) : undefined,
  })
}

/** Imprime sin bloquear la caja más de 8 s si la ticketera no responde. */
export async function printSafe(task: Promise<void>) {
  await Promise.race([task, new Promise<void>((resolve) => setTimeout(resolve, 8000))]).catch(() => undefined)
}

type AssistantResult = {
  ok: boolean
  mensaje?: string
  error?: string
  hash?: string
  codigo_qr?: string
  sunat?: unknown
  files_base64: { pdf?: string; xml_firmado?: string; cdr_xml?: string }
}

function trimResult(data: Record<string, unknown>): AssistantResult {
  const files = (data.files_base64 ?? {}) as Record<string, string | undefined>
  return {
    ok: data.ok === true,
    mensaje: typeof data.mensaje === "string" ? data.mensaje : undefined,
    error: typeof data.error === "string" ? data.error : undefined,
    hash: typeof data.hash === "string" ? data.hash : undefined,
    codigo_qr: typeof data.codigo_qr === "string" ? data.codigo_qr : undefined,
    sunat: data.sunat ?? null,
    files_base64: { pdf: files.pdf, xml_firmado: files.xml_firmado, cdr_xml: files.cdr_xml },
  }
}

/** Firma y envía a SUNAT con el asistente de esta PC. Solo termina bien si SUNAT aceptó (CDR válido). */
export async function emitDocument(documentId: string, onStatus: (message: string) => void) {
  onStatus("Buscando el asistente en esta PC…")
  if (!(await efactReachable())) throw new Error(ASSISTANT_HELP)
  onStatus("Firmando y enviando a SUNAT…")
  const prepared = await prepareAssistantEmit(documentId)
  let data: Record<string, unknown>
  try {
    data = await emitWithLocalBot(prepared.sale)
  } catch (error) {
    const reason = error instanceof Error ? error.message : "No se pudo usar el asistente"
    if (reason.includes("tardó")) await saveAssistantEmitResult(documentId, { ok: false, mensaje: reason }).catch(() => undefined)
    else await releaseAssistantEmit(documentId, reason).catch(() => undefined)
    throw new Error(reason)
  }
  const saved = await saveAssistantEmitResult(documentId, trimResult(data))
  if (saved.status !== "ACCEPTED") throw new Error(saved.error || "El comprobante no quedó aceptado")
}
