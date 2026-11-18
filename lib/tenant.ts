import { connection } from "next/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { isRole } from "@/lib/roles"
import { readSession } from "@/lib/session"
import type { TenantContext } from "@/lib/types"

export async function requireTenant(): Promise<TenantContext> {
  await connection()
  const session = await readSession()
  if (!session) redirect("/login")

  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: session.userId, businessId: session.businessId } },
    include: { business: true, user: true },
  })
  if (!membership || !isRole(membership.role)) redirect("/salir")

  const branch = await prisma.branch.findFirst({
    where: { id: session.branchId, businessId: session.businessId, isActive: true },
  })
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: session.warehouseId, businessId: session.businessId, branchId: session.branchId, isActive: true },
  })
  if (!branch || !warehouse) redirect("/configuracion")

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
      ? personal.filter((item) => item.allowed).map((item) => ({ role: membership.role, permission: item.permission, allowed: true, userId: session.userId }))
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

export async function contextChoices(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      business: {
        include: {
          branches: {
            where: { isActive: true },
            include: { warehouses: { where: { isActive: true }, orderBy: { name: "asc" } } },
            orderBy: { name: "asc" },
          },
        },
      },
    },
    orderBy: { business: { name: "asc" } },
  })
  return memberships.map((membership) => ({
    businessId: membership.businessId,
    businessName: membership.business.name,
    role: membership.role,
    branches: membership.business.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      warehouses: branch.warehouses.map((warehouse) => ({
        id: warehouse.id,
        name: warehouse.name,
      })),
    })),
  }))
}
