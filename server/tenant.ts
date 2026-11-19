import type { Request, Response, NextFunction } from "express"
import { prisma } from "../lib/db"
import { errorMessage } from "../lib/errors"
import { isRole } from "../lib/roles"
import { SESSION_COOKIE, verifySessionToken } from "../lib/session-core"
import type { TenantContext } from "../lib/types"

export type AuthedRequest = Request & { tenant?: TenantContext }

export async function resolveTenant(req: Request): Promise<TenantContext | null> {
  const raw = req.cookies?.[SESSION_COOKIE]
  if (!raw || typeof raw !== "string") return null
  const session = await verifySessionToken(raw)
  if (!session) return null

  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: session.userId, businessId: session.businessId } },
    include: { business: true, user: true },
  })
  if (!membership || !isRole(membership.role)) return null

  const branch = await prisma.branch.findFirst({
    where: { id: session.branchId, businessId: session.businessId, isActive: true },
  })
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: session.warehouseId, businessId: session.businessId, branchId: session.branchId, isActive: true },
  })
  if (!branch || !warehouse) return null

  const [roleGrants, personal] = await Promise.all([
    prisma.permissionGrant.findMany({
      where: { businessId: session.businessId },
      select: { role: true, permission: true, allowed: true },
    }),
    prisma.userPermission.findMany({
      where: { businessId: session.businessId, userId: session.userId },
      select: { permission: true, allowed: true },
    }),
  ])
  const grants = personal.length
    ? personal.some((item) => item.allowed)
      ? personal.filter((item) => item.allowed).map((item) => ({
          role: membership.role,
          permission: item.permission,
          allowed: true,
          userId: session.userId,
        }))
      : [{ role: membership.role, permission: "sell", allowed: false, userId: session.userId }]
    : roleGrants

  return {
    userId: session.userId,
    userName: session.configMode ? "Configuración" : membership.user.name,
    businessId: membership.businessId,
    businessName: membership.business.name,
    role: membership.role,
    branchId: branch.id,
    branchName: branch.name,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    currency: membership.business.currency,
    discountLimitPct: membership.business.discountLimitPct,
    allowCredit: membership.business.allowCredit,
    grants,
    configMode: session.configMode === true,
  }
}

export function requireApiTenant(req: AuthedRequest, res: Response, next: NextFunction) {
  resolveTenant(req)
    .then((tenant) => {
      if (!tenant) {
        res.status(401).json({ error: "Sin sesión" })
        return
      }
      req.tenant = tenant
      next()
    })
    .catch((error) => {
      res.status(500).json({ error: errorMessage(error) })
    })
}
