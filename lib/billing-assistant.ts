import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { afectacionIgv } from "@/lib/billing"
import { D } from "@/lib/money"
import { assertCan, assertCanAny } from "@/lib/roles"
import { decryptSecret, encryptSecret } from "@/lib/secret"
import type { TenantContext } from "@/lib/types"

const MAX_ATTEMPTS = 5
const MAX_CERT_BYTES = 200 * 1024
const ASSISTANT_TYPES: Record<string, "01" | "03"> = { FACTURA: "01", BOLETA: "03" }

type Row = {
  businessId: string
  tradeName: string | null
  address: string | null
  ubigeo: string | null
  department: string | null
  province: string | null
  district: string | null
  phone: string | null
  email: string | null
  solUser: string | null
  solPasswordCipher: string | null
  certCipher: string | null
  certPasswordCipher: string | null
  certName: string | null
}

let ready: Promise<void> | null = null

function ensureTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS AssistantBilling (
      businessId TEXT PRIMARY KEY,
      tradeName TEXT, address TEXT, ubigeo TEXT, department TEXT, province TEXT, district TEXT,
      phone TEXT, email TEXT, solUser TEXT, solPasswordCipher TEXT,
      certCipher TEXT, certPasswordCipher TEXT, certName TEXT, updatedAt DATETIME
    )`)
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS AssistantDocument (
      documentId TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      hash TEXT, qr TEXT, pdfBase64 TEXT, updatedAt DATETIME
    )`)
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS DocumentBuyer (
      documentId TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      address TEXT
    )`)
  })().catch((error) => {
    ready = null
    throw error
  })
  return ready
}

async function readRow(businessId: string) {
  await ensureTables()
  const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM AssistantBilling WHERE businessId = ${businessId}`
  return rows[0] ?? null
}

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max)
}

export async function readTicketHeader(businessId: string) {
  const row = await readRow(businessId)
  return { tradeName: row?.tradeName ?? null, address: row?.address ?? null, phone: row?.phone ?? null, email: row?.email ?? null }
}

/** Dirección, teléfono y correo del negocio (Configuración → Negocio). Son los mismos del asistente (Impresión y SUNAT). */
export async function readBusinessContact(businessId: string) {
  const row = await readRow(businessId)
  return { address: row?.address ?? "", phone: row?.phone ?? "", email: row?.email ?? "" }
}

export async function saveBusinessContact(businessId: string, input: { address: string; phone: string; email: string }) {
  await ensureTables()
  const address = clean(input.address, 250)
  const phone = clean(input.phone, 40)
  const email = clean(input.email, 120)
  await prisma.$executeRawUnsafe(
    `INSERT INTO AssistantBilling (businessId, address, phone, email, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(businessId) DO UPDATE SET address = excluded.address, phone = excluded.phone, email = excluded.email, updatedAt = CURRENT_TIMESTAMP`,
    businessId,
    address || null,
    phone || null,
    email || null,
  )
}

/** ¿Están completos los datos que el asistente necesita para emitir? (sin revelar secretos) */
export async function assistantBillingReady(businessId: string) {
  const row = await readRow(businessId)
  return Boolean(
    row?.address && row.ubigeo && row.department && row.province && row.district && row.solUser && row.solPasswordCipher && row.certCipher && row.certPasswordCipher,
  )
}

export async function assistantDocumentsWithPdf(businessId: string, ids: string[]) {
  await ensureTables()
  if (!ids.length) return new Set<string>()
  const rows = await prisma.$queryRawUnsafe<{ documentId: string }[]>(
    `SELECT documentId FROM AssistantDocument WHERE businessId = ? AND pdfBase64 IS NOT NULL AND documentId IN (${ids.map(() => "?").join(",")})`,
    businessId,
    ...ids,
  )
  return new Set(rows.map((row) => row.documentId))
}

export async function readAssistantBilling(ctx: TenantContext) {
  assertCan(ctx, "billing")
  const row = await readRow(ctx.businessId)
  return {
    tradeName: row?.tradeName ?? "",
    address: row?.address ?? "",
    ubigeo: row?.ubigeo ?? "",
    department: row?.department ?? "",
    province: row?.province ?? "",
    district: row?.district ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    solUser: row?.solUser ?? "",
    hasSolPassword: Boolean(row?.solPasswordCipher),
    certName: row?.certCipher ? row.certName ?? "certificado.pfx" : "",
    hasCertPassword: Boolean(row?.certPasswordCipher),
  }
}

export async function saveAssistantBilling(
  ctx: TenantContext,
  input: {
    tradeName?: string
    address?: string
    ubigeo?: string
    department?: string
    province?: string
    district?: string
    phone?: string
    email?: string
    solUser?: string
    solPassword?: string
    certPassword?: string
    /** Archivo .pfx: File (formulario) o bytes ya leídos (API JSON). */
    cert?: File | { name: string; bytes: Buffer } | null
  },
) {
  assertCan(ctx, "billing")
  const ubigeo = clean(input.ubigeo, 6)
  if (ubigeo && !/^\d{6}$/.test(ubigeo)) throw new AppError("El ubigeo tiene 6 dígitos")
  const solUser = clean(input.solUser, 30).toUpperCase()
  if (solUser && !/^[A-Z0-9]{3,30}$/.test(solUser)) throw new AppError("El usuario SOL solo lleva letras y números")
  let certCipher: string | null = null
  let certName: string | null = null
  if (input.cert) {
    const cert = input.cert as { name: string; bytes?: Buffer; arrayBuffer?: () => Promise<ArrayBuffer> }
    const bytes = cert.bytes ?? Buffer.from(cert.arrayBuffer ? await cert.arrayBuffer() : new ArrayBuffer(0))
    if (bytes.length > 0) {
      if (bytes.length > MAX_CERT_BYTES) throw new AppError("El certificado pesa demasiado")
      if (!/\.(pfx|p12)$/i.test(input.cert.name)) throw new AppError("El certificado debe ser .pfx o .p12")
      certCipher = encryptSecret(bytes.toString("base64"))
      certName = clean(input.cert.name, 80)
    }
  }
  const current = await readRow(ctx.businessId)
  const solPassword = clean(input.solPassword, 100)
  const certPassword = clean(input.certPassword, 100)
  const next = {
    tradeName: clean(input.tradeName) || null,
    address: clean(input.address, 300) || null,
    ubigeo: ubigeo || null,
    department: clean(input.department, 60).toUpperCase() || null,
    province: clean(input.province, 60).toUpperCase() || null,
    district: clean(input.district, 60).toUpperCase() || null,
    phone: clean(input.phone, 30) || null,
    email: clean(input.email, 120) || null,
    solUser: solUser || null,
    solPasswordCipher: solPassword ? encryptSecret(solPassword) : current?.solPasswordCipher ?? null,
    certCipher: certCipher ?? current?.certCipher ?? null,
    certName: certName ?? current?.certName ?? null,
    certPasswordCipher: certPassword ? encryptSecret(certPassword) : current?.certPasswordCipher ?? null,
  }
  await prisma.$executeRaw`
    INSERT INTO AssistantBilling (businessId, tradeName, address, ubigeo, department, province, district, phone, email, solUser, solPasswordCipher, certCipher, certPasswordCipher, certName, updatedAt)
    VALUES (${ctx.businessId}, ${next.tradeName}, ${next.address}, ${next.ubigeo}, ${next.department}, ${next.province}, ${next.district}, ${next.phone}, ${next.email}, ${next.solUser}, ${next.solPasswordCipher}, ${next.certCipher}, ${next.certPasswordCipher}, ${next.certName}, ${new Date()})
    ON CONFLICT(businessId) DO UPDATE SET
      tradeName = excluded.tradeName, address = excluded.address, ubigeo = excluded.ubigeo,
      department = excluded.department, province = excluded.province, district = excluded.district,
      phone = excluded.phone, email = excluded.email, solUser = excluded.solUser,
      solPasswordCipher = excluded.solPasswordCipher, certCipher = excluded.certCipher,
      certPasswordCipher = excluded.certPasswordCipher, certName = excluded.certName, updatedAt = excluded.updatedAt
  `
  await prisma.auditLog.create({
    data: { businessId: ctx.businessId, userId: ctx.userId, action: "BILLING_CONFIG", entity: "AssistantBilling", detail: "Datos del asistente actualizados" },
  })
}

function limaParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00"
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}:${get("second")}` }
}

export async function prepareAssistantEmit(ctx: TenantContext, documentId: string) {
  assertCanAny(ctx, ["billing", "sell"])
  await ensureTables()
  const document = await prisma.electronicDocument.findFirst({ where: { id: documentId, businessId: ctx.businessId } })
  if (!document) throw new AppError("Comprobante no encontrado")
  if (document.status === "ACCEPTED") throw new AppError("Este comprobante ya fue aceptado")
  const tipo = ASSISTANT_TYPES[document.docType]
  if (!tipo) throw new AppError("El asistente local emite boletas y facturas. Las notas usan el proveedor")
  if (document.attempts >= MAX_ATTEMPTS) throw new AppError("Se agotaron los reintentos. Revisa el error antes de seguir")
  if (!document.saleId) throw new AppError("El comprobante no tiene una venta")
  const [business, profile, row, sale, buyer] = await Promise.all([
    prisma.business.findFirst({ where: { id: ctx.businessId } }),
    prisma.billingProfile.findUnique({ where: { businessId: ctx.businessId } }),
    readRow(ctx.businessId),
    prisma.sale.findFirst({
      where: { id: document.saleId, businessId: ctx.businessId },
      include: { lines: { include: { product: { select: { taxType: true } } } }, customer: true },
    }),
    prisma.$queryRaw<{ address: string | null }[]>`SELECT address FROM DocumentBuyer WHERE documentId = ${document.id} AND businessId = ${ctx.businessId}`,
  ])
  if (!business?.taxId) throw new AppError("Configura el RUC del negocio")
  if (!sale) throw new AppError("Venta no encontrada")
  if (!row?.address || !row.ubigeo || !row.department || !row.province || !row.district) {
    throw new AppError("Completa la dirección fiscal y el ubigeo en Configuración → Impresión y SUNAT")
  }
  if (!row.solUser || !row.solPasswordCipher) throw new AppError("Falta el usuario y la clave SOL")
  if (!row.certCipher || !row.certPasswordCipher) throw new AppError("Falta el certificado digital y su contraseña")

  const igvRate = profile?.igvRate ?? 1800
  const divisor = D(10000).plus(igvRate).div(10000)
  const gross = sale.lines.reduce((sum, line) => sum + line.total, 0)
  let assigned = 0
  const lineas = sale.lines.map((line, index) => {
    const share = index === sale.lines.length - 1
      ? sale.total - assigned
      : gross > 0 ? D(line.total).mul(sale.total).div(gross).toDecimalPlaces(0).toNumber() : 0
    assigned += share
    const quantity = D(line.quantity).div(10000)
    // Gravado: el precio lleva IGV y se quita; exonerado (20) e inafecto (30) no llevan IGV.
    const afectacion = afectacionIgv(line.product?.taxType)
    const unit = quantity.gt(0) ? D(share).div(100).div(afectacion === "10" ? divisor : 1).div(quantity) : D(0)
    return {
      descripcion: line.description.slice(0, 250),
      cantidad: quantity.toFixed(4),
      precio_unitario_sin_igv: unit.toFixed(6),
      codigo_afectacion_igv: afectacion,
    }
  })

  const issued = limaParts(document.issuedAt)
  const solPassword = decryptSecret(row.solPasswordCipher)
  const certBase64 = decryptSecret(row.certCipher)
  const certPassword = decryptSecret(row.certPasswordCipher)
  const razon = business.legalName || business.name

  await prisma.electronicDocument.updateMany({
    where: { id: document.id, businessId: ctx.businessId, status: { not: "ACCEPTED" } },
    data: { status: "SENT", attempts: document.attempts + 1, sentAt: new Date(), lastError: null },
  })

  return {
    tipo,
    serie: document.series,
    correlativo: document.number,
    fecha_emision: issued.date,
    hora_emision: issued.time,
    moneda: business.currency === "USD" ? "USD" : "PEN",
    porcentaje_igv: (igvRate / 100).toFixed(2),
    observaciones: "",
    emisor: {
      ruc: business.taxId,
      razon_social: razon,
      nombre_comercial: row.tradeName || business.name || razon,
      ubigeo: row.ubigeo,
      direccion: row.address,
      provincia: row.province,
      departamento: row.department,
      distrito: row.district,
      telefono: row.phone ?? "",
      correo: row.email ?? "",
    },
    cliente: {
      tipo_doc: document.customerDocType || "0",
      numero_doc: document.customerDoc || (document.customerDocType === "6" ? "" : "00000000"),
      razon_social: document.customerName,
      direccion: buyer[0]?.address ?? sale.customer?.address ?? "",
    },
    lineas,
    panel_credenciales: {
      ruc: business.taxId,
      usuario_sol: row.solUser,
      clave_sol: solPassword,
      ambiente: profile?.environment === "prod" ? "produccion" : "beta",
    },
    panel_certificado: { pfx_base64: certBase64, password: certPassword },
  }
}

export type AssistantResult = {
  ok?: boolean
  mensaje?: string
  hash?: string
  codigo_qr?: string
  sunat?: { ok?: boolean; codigo?: string | number; mensaje?: string; respondio?: boolean } | null
  files_base64?: { pdf?: string; xml_firmado?: string; cdr_xml?: string }
  error?: string
}

function fromBase64(value: string | undefined, max: number) {
  if (!value) return ""
  try {
    return Buffer.from(value, "base64").toString("utf8").slice(0, max)
  } catch {
    return ""
  }
}

function cdrAccepts(cdr: string, series: string, number: number) {
  if (!cdr.includes("ApplicationResponse")) return false
  const code = cdr.match(/<cbc:ResponseCode[^>]*>\s*([^<]+?)\s*<\/cbc:ResponseCode>/)?.[1]
  if (code !== "0") return false
  const padded = `${series}-${String(number).padStart(8, "0")}`
  return cdr.includes(padded) || cdr.includes(`${series}-${number}<`)
}

export async function saveAssistantResult(ctx: TenantContext, documentId: string, result: AssistantResult) {
  assertCanAny(ctx, ["billing", "sell"])
  await ensureTables()
  const document = await prisma.electronicDocument.findFirst({ where: { id: documentId, businessId: ctx.businessId } })
  if (!document) throw new AppError("Comprobante no encontrado")
  if (document.status === "ACCEPTED") return document
  const signed = fromBase64(result.files_base64?.xml_firmado, 500000)
  const cdr = fromBase64(result.files_base64?.cdr_xml, 500000)
  const code = result.sunat?.codigo !== undefined && result.sunat?.codigo !== null ? String(result.sunat.codigo).slice(0, 20) : null
  const message = clean(result.sunat?.mensaje || result.mensaje || result.error, 300)
  let status: "ACCEPTED" | "REJECTED" | "ERROR"
  let lastError: string | null = null
  if (result.sunat?.ok && cdrAccepts(cdr, document.series, document.number)) {
    status = "ACCEPTED"
  } else if (result.sunat?.ok) {
    status = "ERROR"
    lastError = "El asistente dijo aceptado, pero el CDR no coincide con este comprobante. No se marcó como aceptado."
  } else if (result.sunat?.respondio) {
    status = "REJECTED"
    lastError = `SUNAT respondió ${code ?? "sin código"}${message ? `: ${message}` : ""}`
  } else if (!signed) {
    status = "ERROR"
    lastError = message || "El asistente no pudo firmar el comprobante. Revisa el certificado."
  } else {
    status = "ERROR"
    lastError = message || "Se firmó, pero SUNAT no respondió. Se puede reintentar."
  }
  await prisma.electronicDocument.updateMany({
    where: { id: document.id, businessId: ctx.businessId, status: { not: "ACCEPTED" } },
    data: {
      status,
      lastError,
      responseCode: code ?? document.responseCode,
      ...(cdr ? { cdrText: cdr } : {}),
      ...(signed ? { xmlText: signed } : {}),
    },
  })
  const pdf = result.files_base64?.pdf && result.files_base64.pdf.length < 3_000_000 ? result.files_base64.pdf : null
  await prisma.$executeRaw`
    INSERT INTO AssistantDocument (documentId, businessId, hash, qr, pdfBase64, updatedAt)
    VALUES (${document.id}, ${ctx.businessId}, ${clean(result.hash, 200) || null}, ${clean(result.codigo_qr, 500) || null}, ${pdf}, ${new Date()})
    ON CONFLICT(documentId) DO UPDATE SET
      hash = COALESCE(excluded.hash, hash), qr = COALESCE(excluded.qr, qr),
      pdfBase64 = COALESCE(excluded.pdfBase64, pdfBase64), updatedAt = excluded.updatedAt
  `
  await prisma.auditLog.create({
    data: {
      businessId: ctx.businessId,
      userId: ctx.userId,
      action: "DOCUMENT_SEND",
      entity: "ElectronicDocument",
      entityId: document.id,
      detail: `${document.series}-${document.number} por asistente local: ${status}`,
    },
  })
  return prisma.electronicDocument.findFirstOrThrow({ where: { id: document.id, businessId: ctx.businessId } })
}

export async function releaseAssistantEmit(ctx: TenantContext, documentId: string, reason: string) {
  assertCanAny(ctx, ["billing", "sell"])
  await prisma.electronicDocument.updateMany({
    where: { id: documentId, businessId: ctx.businessId, status: "SENT" },
    data: {
      status: "ERROR",
      attempts: { decrement: 1 },
      lastError: clean(reason, 300) || "No se pudo usar el asistente local. Se puede reintentar.",
    },
  })
}

export async function saveBuyerAddress(ctx: TenantContext, documentId: string, address: string) {
  await ensureTables()
  const value = clean(address, 300)
  if (!value) return
  await prisma.$executeRaw`
    INSERT INTO DocumentBuyer (documentId, businessId, address) VALUES (${documentId}, ${ctx.businessId}, ${value})
    ON CONFLICT(documentId) DO UPDATE SET address = excluded.address
  `
}

export async function readAssistantDocument(ctx: TenantContext, documentId: string) {
  assertCanAny(ctx, ["billing", "sell"])
  await ensureTables()
  const rows = await prisma.$queryRaw<{ hash: string | null; qr: string | null; pdfBase64: string | null }[]>`
    SELECT hash, qr, pdfBase64 FROM AssistantDocument WHERE documentId = ${documentId} AND businessId = ${ctx.businessId}
  `
  return rows[0] ?? null
}
