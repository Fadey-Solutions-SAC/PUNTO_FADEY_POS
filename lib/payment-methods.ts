import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"
import { randomUUID } from "node:crypto"

export type PaymentMethodOption = {
  id: string
  code: string
  label: string
  locked: boolean
}

const DEFAULTS: { code: string; label: string; locked: boolean }[] = [
  { code: "CASH", label: "Efectivo", locked: true },
  { code: "CARD", label: "Tarjeta", locked: false },
  { code: "TRANSFER", label: "Transferencia", locked: false },
  { code: "OTHER", label: "Otro", locked: false },
]

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS BusinessPaymentMethod (
      id TEXT PRIMARY KEY NOT NULL,
      businessId TEXT NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      locked INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  // Índice nombrado (estilo Prisma). Evita UNIQUE(...) → sqlite_autoindex_* que db push no puede dropear.
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "BusinessPaymentMethod_businessId_code_key"
    ON "BusinessPaymentMethod"("businessId", "code")
  `)
}

async function seedDefaults(businessId: string) {
  const count = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM BusinessPaymentMethod WHERE businessId = ?`,
    businessId,
  )
  if ((count[0]?.n ?? 0) > 0) return
  for (const item of DEFAULTS) {
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO BusinessPaymentMethod (id, businessId, code, label, locked, createdAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      randomUUID(),
      businessId,
      item.code,
      item.label,
      item.locked ? 1 : 0,
    )
  }
}

function slug(label: string) {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24)
  return base || "METODO"
}

export async function listPaymentMethods(ctx: TenantContext): Promise<PaymentMethodOption[]> {
  await ensureTable()
  await seedDefaults(ctx.businessId)
  const rows = await prisma.$queryRawUnsafe<{ id: string; code: string; label: string; locked: number }[]>(
    `SELECT id, code, label, locked FROM BusinessPaymentMethod WHERE businessId = ? ORDER BY locked DESC, label ASC`,
    ctx.businessId,
  )
  return rows.map((row) => ({ id: row.id, code: row.code, label: row.label, locked: row.locked === 1 }))
}

export async function paymentMethodLabels(ctx: TenantContext) {
  const methods = await listPaymentMethods(ctx)
  return Object.fromEntries(methods.map((item) => [item.code, item.label])) as Record<string, string>
}

export async function createPaymentMethod(ctx: TenantContext, labelRaw: string) {
  assertCan(ctx, "settings")
  await ensureTable()
  await seedDefaults(ctx.businessId)
  const label = labelRaw.trim().slice(0, 40)
  if (label.length < 2) throw new AppError("Escribe el nombre del método de pago")
  let code = slug(label)
  if (code === "CREDIT") throw new AppError("Crédito no se configura aquí")
  const existing = await prisma.$queryRawUnsafe<{ code: string }[]>(
    `SELECT code FROM BusinessPaymentMethod WHERE businessId = ?`,
    ctx.businessId,
  )
  const used = new Set(existing.map((row) => row.code))
  if (used.has(code)) {
    let n = 2
    while (used.has(`${code}_${n}`)) n += 1
    code = `${code}_${n}`
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO BusinessPaymentMethod (id, businessId, code, label, locked, createdAt)
     VALUES (?, ?, ?, ?, 0, datetime('now'))`,
    randomUUID(),
    ctx.businessId,
    code,
    label,
  )
  await prisma.auditLog.create({
    data: {
      businessId: ctx.businessId,
      userId: ctx.userId,
      action: "PAYMENT_METHOD_CREATE",
      entity: "BusinessPaymentMethod",
      entityId: code,
      detail: label,
    },
  })
}

export async function deletePaymentMethod(ctx: TenantContext, id: string) {
  assertCan(ctx, "settings")
  await ensureTable()
  const rows = await prisma.$queryRawUnsafe<{ id: string; code: string; locked: number }[]>(
    `SELECT id, code, locked FROM BusinessPaymentMethod WHERE id = ? AND businessId = ?`,
    id,
    ctx.businessId,
  )
  const row = rows[0]
  if (!row) throw new AppError("Método no encontrado")
  if (row.locked === 1 || row.code === "CASH") throw new AppError("El efectivo no se puede eliminar")
  await prisma.$executeRawUnsafe(`DELETE FROM BusinessPaymentMethod WHERE id = ? AND businessId = ?`, id, ctx.businessId)
  await prisma.auditLog.create({
    data: {
      businessId: ctx.businessId,
      userId: ctx.userId,
      action: "PAYMENT_METHOD_DELETE",
      entity: "BusinessPaymentMethod",
      entityId: row.code,
      detail: row.code,
    },
  })
}
