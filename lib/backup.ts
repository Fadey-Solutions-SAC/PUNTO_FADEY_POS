import { mkdir, readdir, stat, unlink } from "node:fs/promises"
import path from "node:path"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { assertCan } from "@/lib/roles"
import { databaseFilePath, uploadsDir } from "@/lib/storage"
import type { TenantContext } from "@/lib/types"

/**
 * Copias de seguridad de la base SQLite.
 *
 * - Se hacen con `VACUUM INTO`: copia consistente aunque haya ventas en curso (copiar el archivo
 *   a mano mientras se escribe puede dar una copia dañada).
 * - Se guardan junto a la base (con DB_PATH, en el disco persistente de Render), no en la carpeta
 *   del código, que se borra en cada despliegue.
 * - Manuales: `manual-<fecha>.db`. Automáticas: una por día `auto-<fecha>.db`, se guardan las últimas 7.
 * - El archivo tiene TODOS los negocios del servidor: si hay más de uno, no se entrega a un dueño.
 */

const AUTO_KEEP = 7
const MANUAL_KEEP = 10
const NAME = /^(auto|manual)-[0-9T-]+\.db$/

function databaseFile() {
  const file = databaseFilePath()
  if (!file || file.includes("..")) throw new AppError("La base de datos no es un archivo local")
  return file
}

export function backupDir() {
  if (process.env.DB_PATH?.trim()) return path.join(path.dirname(databaseFile()), "backups")
  return path.resolve(process.cwd(), "data", "backups")
}

export function backupPath(name: string) {
  if (!NAME.test(name)) throw new AppError("Copia no válida")
  return path.join(backupDir(), name)
}

function stampNow() {
  // 2026-11-20T09-15-02 (hora del servidor, que corre en hora de Perú)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
}

async function snapshot(name: string) {
  const target = backupPath(name)
  await mkdir(path.dirname(target), { recursive: true })
  await unlink(target).catch(() => undefined)
  // VACUUM INTO no admite parámetros enlazados en todas las versiones: la ruta se escapa a mano.
  const literal = target.replaceAll("\\", "/").replaceAll("'", "''")
  await prisma.$executeRawUnsafe(`VACUUM INTO '${literal}'`)
  return target
}

async function prune(prefix: "auto" | "manual", keep: number) {
  const names = (await readdir(backupDir()).catch(() => [] as string[])).filter((name) => name.startsWith(`${prefix}-`) && NAME.test(name)).sort()
  const extra = names.slice(0, Math.max(0, names.length - keep))
  await Promise.all(extra.map((name) => unlink(path.join(backupDir(), name)).catch(() => undefined)))
}

async function assertSingleBusiness() {
  const businesses = await prisma.business.count()
  if (businesses > 1) {
    throw new AppError("Este servidor tiene varios negocios en la misma base: la copia completa solo la puede sacar el administrador del servidor.")
  }
}

export async function createBackup(ctx: TenantContext) {
  assertCan(ctx, "backup")
  await assertSingleBusiness()
  const name = `manual-${stampNow()}.db`
  const target = await snapshot(name)
  await prune("manual", MANUAL_KEEP)
  await prisma.auditLog.create({
    data: { businessId: ctx.businessId, userId: ctx.userId, action: "BACKUP", entity: "Database", detail: name },
  })
  return { name, target }
}

/** Copia automática del día (si aún no existe). La llama el servidor cada pocas horas. */
export async function autoBackup() {
  const day = stampNow().slice(0, 10)
  const existing = await readdir(backupDir()).catch(() => [] as string[])
  if (existing.some((name) => name.startsWith(`auto-${day}`))) return null
  const name = `auto-${day}T${stampNow().slice(11)}.db`
  await snapshot(name)
  await prune("auto", AUTO_KEEP)
  return name
}

export async function listBackups(ctx: TenantContext) {
  assertCan(ctx, "backup")
  const names = (await readdir(backupDir()).catch(() => [] as string[])).filter((name) => NAME.test(name))
  const rows = await Promise.all(
    names.map(async (name) => {
      const info = await stat(path.join(backupDir(), name))
      return { name, kind: name.startsWith("auto-") ? "auto" : "manual", size: info.size, createdAt: info.mtime }
    }),
  )
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

/** Ruta del archivo para descargarlo (valida permiso, nombre y que haya un solo negocio). */
export async function backupForDownload(ctx: TenantContext, name: string) {
  assertCan(ctx, "backup")
  await assertSingleBusiness()
  const file = backupPath(name)
  await stat(file).catch(() => {
    throw new AppError("Copia no encontrada")
  })
  await prisma.auditLog.create({
    data: { businessId: ctx.businessId, userId: ctx.userId, action: "BACKUP_DOWNLOAD", entity: "Database", detail: name },
  })
  return file
}

export async function eraseAllData() {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'",
  )
  const tables = rows.map((row) => row.name).filter((name) => /^[A-Za-z0-9_]+$/.test(name))
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF")
  try {
    for (const table of tables) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)
    }
  } finally {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON")
  }
  const dir = uploadsDir()
  const names = await readdir(dir).catch(() => [] as string[])
  await Promise.all(
    names
      .filter((item) => /^(login-cover|brand-logo)(-[A-Za-z0-9_-]+)?\.(jpg|png|webp)$/.test(item))
      .map((item) => unlink(path.join(dir, item)).catch(() => undefined)),
  )
}
