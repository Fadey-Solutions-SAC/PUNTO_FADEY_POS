import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { assertNoCode } from "@/lib/guard"
import { toFactorInt, toPercentInt } from "@/lib/money"
import { isPermission, isRole, type Role } from "@/lib/roles"

const DEFAULT_UNITS = [
  { name: "Unidad", symbol: "und", dimension: "UNIT" },
  { name: "Kilogramo", symbol: "kg", dimension: "WEIGHT" },
  { name: "Gramo", symbol: "g", dimension: "WEIGHT" },
  { name: "Metro", symbol: "m", dimension: "LENGTH" },
  { name: "Centímetro", symbol: "cm", dimension: "LENGTH" },
  { name: "Litro", symbol: "L", dimension: "VOLUME" },
  { name: "Mililitro", symbol: "ml", dimension: "VOLUME" },
] as const

const DEFAULT_CONVERSIONS = [
  ["g", "kg", "0.001"],
  ["kg", "g", "1000"],
  ["cm", "m", "0.01"],
  ["m", "cm", "100"],
  ["ml", "L", "0.001"],
  ["L", "ml", "1000"],
] as const

export const INTERNAL_EMAIL = "configuracion@interno.fadey"

export function isInternalUser(email: string) {
  return email.endsWith("@interno.fadey")
}

export async function userCount() {
  return prisma.user.count({ where: { email: { not: INTERNAL_EMAIL } } })
}

export async function businessCount() {
  return prisma.business.count()
}

export async function provisionBusiness(userId: string, input: { businessName: string; branchName: string; currency?: string }) {
  const businessName = input.businessName.trim()
  const branchName = input.branchName.trim() || "Principal"
  if (businessName.length < 2) throw new AppError("Indica el nombre del negocio")

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: businessName,
        currency: (input.currency ?? "PEN").toUpperCase(),
        discountLimitPct: toPercentInt("10"),
      },
    })
    await tx.membership.create({
      data: { userId, businessId: business.id, role: "OWNER" },
    })
    const branch = await tx.branch.create({
      data: { businessId: business.id, name: branchName },
    })
    const warehouse = await tx.warehouse.create({
      data: { businessId: business.id, branchId: branch.id, name: "Principal", isDefault: true },
    })
    const register = await tx.cashRegister.create({
      data: { businessId: business.id, branchId: branch.id, name: "Caja 1" },
    })
    await tx.membership.update({
      where: { userId_businessId: { userId, businessId: business.id } },
      data: { cashRegisterId: register.id },
    })
    await tx.priceList.create({
      data: { businessId: business.id, name: "General", isDefault: true },
    })
    const units = []
    for (const unit of DEFAULT_UNITS) {
      units.push(
        await tx.unit.create({
          data: { businessId: business.id, name: unit.name, symbol: unit.symbol, dimension: unit.dimension },
        }),
      )
    }
    const bySymbol = new Map(units.map((unit) => [unit.symbol, unit.id]))
    for (const [from, to, factor] of DEFAULT_CONVERSIONS) {
      const fromUnitId = bySymbol.get(from)
      const toUnitId = bySymbol.get(to)
      if (!fromUnitId || !toUnitId) continue
      await tx.unitConversion.create({
        data: { businessId: business.id, fromUnitId, toUnitId, factor: toFactorInt(factor) },
      })
    }
    return { businessId: business.id, branchId: branch.id, warehouseId: warehouse.id, registerId: register.id }
  })
}

export async function registerOwner(input: {
  name: string
  email: string
  password: string
  businessName: string
  branchName: string
}) {
  assertNoCode(input.name)
  assertNoCode(input.email)
  assertNoCode(input.password)
  assertNoCode(input.businessName)
  assertNoCode(input.branchName)
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  if (name.length < 2) throw new AppError("Indica tu nombre")
  if (!email.includes("@")) throw new AppError("Correo inválido")
  if (input.password.length < 8) throw new AppError("La contraseña debe tener al menos 8 caracteres")
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new AppError("Ese correo ya está registrado")
  const username = await freeUsername(email.split("@")[0] ?? "")
  const user = await prisma.user.create({
    data: { name, username, email, passwordHash: await bcrypt.hash(input.password, 10) },
  })
  const place = await provisionBusiness(user.id, input)
  return { user, ...place }
}

export async function authenticate(login: string, password: string) {
  assertNoCode(login)
  assertNoCode(password)
  const key = login.trim().toLowerCase()
  if (isInternalUser(key)) throw new AppError("Usuario o contraseña incorrectos")
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: key }, { email: key }] },
    include: {
      memberships: {
        include: {
          business: {
            include: {
              branches: { where: { isActive: true }, include: { warehouses: { where: { isActive: true } } } },
            },
          },
        },
      },
    },
  })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError("Usuario o contraseña incorrectos")
  }
  const membership = user.memberships[0]
  if (!membership) throw new AppError("Este usuario no pertenece a un negocio")
  const branch = membership.business.branches[0]
  const warehouse = branch?.warehouses.find((item) => item.isDefault) ?? branch?.warehouses[0]
  if (!branch || !warehouse) throw new AppError("El negocio no tiene sucursal ni almacén activo")
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    businessId: membership.businessId,
    branchId: branch.id,
    warehouseId: warehouse.id,
  }
}

function cleanUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "")
}

export function isUsername(value: string) {
  return /^[a-z0-9._-]{3,32}$/.test(value)
}

async function freeUsername(base: string) {
  const root = cleanUsername(base).replace(/[^a-z0-9._-]/g, "") || "usuario"
  let candidate = root.slice(0, 32)
  let extra = 1
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    extra += 1
    candidate = `${root.slice(0, 28)}${extra}`
  }
  return candidate
}

export async function createUser(
  ctxBusinessId: string,
  actorRole: Role,
  input: { name: string; email?: string; username?: string; password: string; role: string; cashRegisterId?: string; permissions?: string[] },
) {
  assertNoCode(input.name)
  assertNoCode(input.username ?? "")
  assertNoCode(input.email ?? "")
  assertNoCode(input.password)
  if (actorRole !== "OWNER") throw new AppError("Solo el dueño puede crear usuarios")
  if (!isRole(input.role) || input.role === "OWNER") throw new AppError("Rol inválido")
  const name = input.name.trim()
  if (name.length < 2) throw new AppError("Indica el nombre")
  if (input.password.length < 8) throw new AppError("La contraseña debe tener al menos 8 caracteres")
  const username = input.username ? cleanUsername(input.username) : cleanUsername((input.email ?? "").split("@")[0] ?? "")
  if (!isUsername(username)) throw new AppError("El usuario debe tener entre 3 y 32 letras o números")
  const email = (input.email?.trim().toLowerCase() || `${username}@users.puntofadey.local`)
  if (input.email && !email.includes("@")) throw new AppError("Correo inválido")
  const taken = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } })
  if (taken) throw new AppError("Ese usuario ya está registrado")
  const permissions = (input.permissions ?? []).filter((permission) => isPermission(permission) && permission !== "users" && permission !== "permissions")
  const registerId = input.cashRegisterId?.trim() || null
  if (permissions.includes("cash") && !registerId) throw new AppError("Asigna una caja a este usuario")
  if (registerId) {
    const register = await prisma.cashRegister.findFirst({ where: { id: registerId, businessId: ctxBusinessId, isActive: true } })
    if (!register) throw new AppError("Caja no encontrada")
  }
  return prisma.user.create({
    data: {
      name,
      username,
      email,
      passwordHash: await bcrypt.hash(input.password, 10),
      memberships: { create: { businessId: ctxBusinessId, role: input.role, cashRegisterId: registerId } },
      permissions: input.permissions
        ? {
            create: permissions.length
              ? permissions.map((permission) => ({ businessId: ctxBusinessId, permission, allowed: true }))
              : [{ businessId: ctxBusinessId, permission: "sell", allowed: false }],
          }
        : undefined,
    },
  })
}

export async function updateMember(
  ctxBusinessId: string,
  actorRole: Role,
  input: { userId: string; name: string; username: string; password?: string; cashRegisterId?: string; permissions?: string[] },
) {
  assertNoCode(input.name)
  assertNoCode(input.username)
  if (input.password) assertNoCode(input.password)
  if (actorRole !== "OWNER") throw new AppError("Solo el dueño puede editar usuarios")
  const member = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: input.userId, businessId: ctxBusinessId } },
    include: { user: true },
  })
  if (!member) throw new AppError("Usuario no encontrado")
  const name = input.name.trim()
  const username = cleanUsername(input.username)
  if (name.length < 2) throw new AppError("Indica el nombre")
  if (!isUsername(username)) throw new AppError("El usuario debe tener entre 3 y 32 letras o números")
  const taken = await prisma.user.findFirst({ where: { username, NOT: { id: member.userId } } })
  if (taken) throw new AppError("Ese usuario ya está registrado")
  const registerId = input.cashRegisterId?.trim() || null
  if (registerId) {
    const register = await prisma.cashRegister.findFirst({ where: { id: registerId, businessId: ctxBusinessId, isActive: true } })
    if (!register) throw new AppError("Caja no encontrada")
  }
  // undefined = "según su rol": se borran los permisos personales del usuario.
  const permissions =
    member.role === "OWNER"
      ? null
      : input.permissions === undefined
        ? undefined
        : input.permissions.filter((permission) => isPermission(permission) && permission !== "users" && permission !== "permissions")
  if (permissions?.includes("cash") && !registerId) throw new AppError("Asigna una caja a este usuario")
  if (member.role === "OWNER" && !registerId) throw new AppError("Asigna una caja al dueño")
  if (input.password && input.password.length < 8) throw new AppError("La contraseña debe tener al menos 8 caracteres")
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: member.userId },
      data: {
        name,
        username,
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 10) } : {}),
      },
    })
    await tx.membership.update({
      where: { id: member.id },
      data: { cashRegisterId: registerId },
    })
    if (permissions === undefined) {
      await tx.userPermission.deleteMany({ where: { businessId: ctxBusinessId, userId: member.userId } })
    } else if (permissions) {
      await tx.userPermission.deleteMany({ where: { businessId: ctxBusinessId, userId: member.userId } })
      if (permissions.length) {
        await tx.userPermission.createMany({
          data: permissions.map((permission) => ({ businessId: ctxBusinessId, userId: member.userId, permission, allowed: true })),
        })
      } else {
        await tx.userPermission.create({
          data: { businessId: ctxBusinessId, userId: member.userId, permission: "sell", allowed: false },
        })
      }
    }
  })
}

export async function deleteMember(ctxBusinessId: string, actorRole: Role, actorId: string, userId: string) {
  if (actorRole !== "OWNER") throw new AppError("Solo el dueño puede eliminar usuarios")
  if (actorId === userId) throw new AppError("No puedes eliminar tu propio usuario")
  const member = await prisma.membership.findUnique({
    where: { userId_businessId: { userId, businessId: ctxBusinessId } },
  })
  if (!member) throw new AppError("Usuario no encontrado")
  if (member.role === "OWNER") throw new AppError("El dueño no se puede eliminar")
  const open = await prisma.cashSession.findFirst({ where: { businessId: ctxBusinessId, userId, status: "OPEN" } })
  if (open) throw new AppError("Ese usuario tiene una caja abierta")
  await prisma.membership.delete({ where: { id: member.id } })
  await prisma.userPermission.deleteMany({ where: { businessId: ctxBusinessId, userId } })
  const others = await prisma.membership.count({ where: { userId } })
  if (others > 0) return
  try {
    await prisma.user.delete({ where: { id: userId } })
  } catch {
    await prisma.user.update({
      where: { id: userId },
      data: { username: `retirado-${userId.slice(-6)}`, email: `retirado-${userId}@users.puntofadey.local` },
    })
  }
}

export async function openConfigSession() {
  const memberships = await prisma.membership.findMany({
    where: { role: "OWNER" },
    include: {
      user: true,
      business: {
        include: {
          branches: { where: { isActive: true }, include: { warehouses: { where: { isActive: true } } } },
        },
      },
    },
    orderBy: { business: { createdAt: "asc" } },
  })
  const placeOf = (item: (typeof memberships)[number]) => {
    const branch = item.business.branches[0]
    const warehouse = branch?.warehouses.find((row) => row.isDefault) ?? branch?.warehouses[0]
    return branch && warehouse ? { branch, warehouse } : null
  }
  const chosen = memberships.find((item) => !isInternalUser(item.user.email) && placeOf(item)) ?? memberships.find((item) => placeOf(item))
  if (chosen) {
    const place = placeOf(chosen)
    if (!place) throw new AppError("El negocio no tiene sucursal ni almacén activo")
    return {
      userId: chosen.userId,
      name: "Configuración",
      email: chosen.user.email,
      businessId: chosen.businessId,
      branchId: place.branch.id,
      warehouseId: place.warehouse.id,
      configMode: true,
    }
  }
  let user = await prisma.user.findUnique({ where: { email: INTERNAL_EMAIL } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: "Configuración",
        email: INTERNAL_EMAIL,
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
      },
    })
  }
  const created = await provisionBusiness(user.id, { businessName: "Mi negocio", branchName: "Principal" })
  return {
    userId: user.id,
    name: "Configuración",
    email: user.email,
    businessId: created.businessId,
    branchId: created.branchId,
    warehouseId: created.warehouseId,
    configMode: true,
  }
}

export async function suggestFactor(businessId: string, fromUnitId: string, toUnitId: string) {
  if (!fromUnitId || !toUnitId || fromUnitId === toUnitId) return null
  const direct = await prisma.unitConversion.findFirst({
    where: { businessId, fromUnitId, toUnitId },
  })
  return direct?.factor ?? null
}
