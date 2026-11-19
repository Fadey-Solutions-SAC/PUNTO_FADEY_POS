import { prisma } from "@/lib/db"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS BusinessPosSetting (
      businessId TEXT PRIMARY KEY NOT NULL,
      hardwareReader INTEGER NOT NULL DEFAULT 0
    )
  `)
}

export async function readPosSettings(businessId: string) {
  await ensureTable()
  const rows = await prisma.$queryRawUnsafe<{ hardwareReader: number }[]>(
    `SELECT hardwareReader FROM BusinessPosSetting WHERE businessId = ?`,
    businessId,
  )
  return {
    hardwareReader: (rows[0]?.hardwareReader ?? 0) === 1,
  }
}

export async function saveHardwareReader(ctx: TenantContext, enabled: boolean) {
  assertCan(ctx, "settings")
  await ensureTable()
  await prisma.$executeRawUnsafe(
    `INSERT INTO BusinessPosSetting (businessId, hardwareReader) VALUES (?, ?)
     ON CONFLICT(businessId) DO UPDATE SET hardwareReader = excluded.hardwareReader`,
    ctx.businessId,
    enabled ? 1 : 0,
  )
}
