import { copyFile, mkdir, readdir, unlink } from "node:fs/promises"
import path from "node:path"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { assertCan } from "@/lib/roles"
import { databaseFilePath, uploadsDir } from "@/lib/storage"
import type { TenantContext } from "@/lib/types"

function databaseFile() {
  const file = databaseFilePath()
  if (!file || file.includes("..")) throw new AppError("La base de datos no es un archivo local")
  return file
}

export function backupPath(name: string) {
  return path.resolve(process.cwd(), "data", "backups", name)
}

export async function createBackup(ctx: TenantContext) {
  assertCan(ctx, "backup")
  const stamp = new Date().toISOString().replaceAll(":", "-")
  const name = `punto-fadey-${stamp}.db`
  const target = backupPath(name)
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(databaseFile(), target)
  await prisma.auditLog.create({
    data: { businessId: ctx.businessId, userId: ctx.userId, action: "BACKUP", entity: "Database", detail: name },
  })
  return { name, target }
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
      .filter((item) => /^(login-cover|brand-logo)\.(jpg|png|webp)$/.test(item))
      .map((item) => unlink(path.join(dir, item)).catch(() => undefined)),
  )
}
