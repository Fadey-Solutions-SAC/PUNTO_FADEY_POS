import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { assertCan } from "@/lib/roles"
import { themeById, type ThemeId } from "@/lib/themes"
import type { TenantContext } from "@/lib/types"

export async function readTheme(businessId: string): Promise<ThemeId> {
  const rows = await prisma.$queryRaw<{ theme: string }[]>`SELECT theme FROM Business WHERE id = ${businessId}`
  return themeById(rows[0]?.theme).id
}

export async function saveTheme(ctx: TenantContext, themeId: string) {
  assertCan(ctx, "settings")
  const theme = themeById(themeId)
  if (theme.id !== themeId) throw new AppError("Color no disponible")
  await prisma.$executeRaw`UPDATE Business SET theme = ${theme.id} WHERE id = ${ctx.businessId}`
}
