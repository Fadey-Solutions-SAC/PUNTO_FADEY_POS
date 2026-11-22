import type { Express } from "express"
import { prisma } from "../../lib/db"
import { AppError, errorMessage } from "../../lib/errors"
import { PERMISSIONS, PERMISSION_LABEL, ROLES, ROLE_LABEL, can, isRole, type Permission, type Role } from "../../lib/roles"
import { createUser, deleteMember, updateMember } from "../../lib/setup"
import { requireApiTenant, type AuthedRequest } from "../tenant"

/** Permisos que se asignan a usuarios y roles ("usuarios" y "permisos" son solo del dueño). */
const ASSIGNABLE = PERMISSIONS.filter((item) => item !== "users" && item !== "permissions")

function permissionList(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw.map(String).filter((item): item is Permission => (ASSIGNABLE as readonly string[]).includes(item))
}

export function registerUsersRoutes(app: Express) {
  // Usuarios del negocio, cajas y matriz de permisos por rol.
  app.get("/api/settings/users", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "settings", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de configuración" })
        return
      }
      const [members, registers, roleGrants, personal] = await Promise.all([
        prisma.membership.findMany({
          where: { businessId: ctx.businessId, user: { email: { not: "configuracion@interno.fadey" } } },
          include: { user: true, register: true },
          orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
        }),
        prisma.cashRegister.findMany({
          where: { businessId: ctx.businessId, isActive: true },
          include: { branch: { select: { name: true } } },
          orderBy: { name: "asc" },
        }),
        prisma.permissionGrant.findMany({ where: { businessId: ctx.businessId } }),
        prisma.userPermission.findMany({ where: { businessId: ctx.businessId } }),
      ])
      const roleMatrix = ROLES.filter((role) => role !== "OWNER").map((role) => ({
        role,
        label: ROLE_LABEL[role],
        permissions: ASSIGNABLE.filter((permission) =>
          can(role, permission, roleGrants.map((item) => ({ role: item.role, permission: item.permission, allowed: item.allowed }))),
        ),
      }))
      res.json({
        canManage: ctx.configMode === true || ctx.role === "OWNER" || ctx.role === "ADMIN",
        configMode: ctx.configMode === true,
        currentUserId: ctx.userId,
        // El modo configuración puede crear al Dueño (administrador del negocio) y cambiar cualquier rol.
        roles: ROLES.filter((role) => role !== "OWNER" || ctx.configMode === true).map((role) => ({
          code: role,
          label: role === "OWNER" ? "Dueño (administrador del negocio)" : ROLE_LABEL[role],
        })),
        permissions: ASSIGNABLE.map((code) => ({ code, label: PERMISSION_LABEL[code] })),
        registers: registers.map((item) => ({ id: item.id, name: `${item.name} · ${item.branch.name}` })),
        roleMatrix,
        users: members.map((member) => {
          const mine = personal.filter((item) => item.userId === member.userId)
          const custom = member.role !== "OWNER" && mine.length > 0
          const effective =
            member.role === "OWNER"
              ? [...ASSIGNABLE]
              : custom
                ? mine.filter((item) => item.allowed).map((item) => item.permission)
                : roleMatrix.find((row) => row.role === member.role)?.permissions ?? []
          return {
            id: member.userId,
            name: member.user.name,
            username: member.user.username ?? "",
            role: member.role,
            roleLabel: ROLE_LABEL[member.role as Role] ?? member.role,
            registerId: member.cashRegisterId ?? "",
            registerName: member.register?.name ?? "",
            mode: custom ? "custom" : "role",
            permissions: effective,
          }
        }),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/settings/users", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const role = String(req.body?.role ?? "")
      const custom = req.body?.mode === "custom"
      const user = await createUser(ctx.businessId, { role: ctx.role as Role, configMode: ctx.configMode === true }, {
        name: String(req.body?.name ?? ""),
        username: String(req.body?.username ?? ""),
        password: String(req.body?.password ?? ""),
        role,
        cashRegisterId: String(req.body?.registerId ?? ""),
        permissions: custom ? permissionList(req.body?.permissions) : undefined,
      })
      await prisma.auditLog.create({
        data: { businessId: ctx.businessId, userId: ctx.userId, action: "user.create", entity: "User", entityId: user.id, detail: `${user.name} · ${role}` },
      })
      res.json({ ok: true, id: user.id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.put("/api/settings/users/:id", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const custom = req.body?.mode === "custom"
      const password = String(req.body?.password ?? "")
      await updateMember(ctx.businessId, { role: ctx.role as Role, configMode: ctx.configMode === true }, {
        userId: String(req.params.id),
        role: req.body?.role ? String(req.body.role) : undefined,
        name: String(req.body?.name ?? ""),
        username: String(req.body?.username ?? ""),
        password: password || undefined,
        cashRegisterId: String(req.body?.registerId ?? ""),
        permissions: custom ? permissionList(req.body?.permissions) : undefined,
      })
      await prisma.auditLog.create({
        data: {
          businessId: ctx.businessId,
          userId: ctx.userId,
          action: "user.update",
          entity: "User",
          entityId: String(req.params.id),
          detail: `${custom ? "permisos personalizados" : "permisos del rol"}${password ? " · cambio de contraseña" : ""}`,
        },
      })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete("/api/settings/users/:id", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      await deleteMember(ctx.businessId, { role: ctx.role as Role, configMode: ctx.configMode === true }, ctx.userId, String(req.params.id))
      await prisma.auditLog.create({
        data: { businessId: ctx.businessId, userId: ctx.userId, action: "user.delete", entity: "User", entityId: String(req.params.id) },
      })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Permisos por rol: se guardan solo las diferencias con los valores por defecto.
  app.post("/api/settings/role-permissions", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (ctx.role !== "OWNER") throw new AppError("Solo el dueño puede cambiar los permisos")
      const wanted = new Set(Array.isArray(req.body?.grants) ? req.body.grants.map(String) : [])
      let changes = 0
      await prisma.$transaction(async (tx) => {
        await tx.permissionGrant.deleteMany({ where: { businessId: ctx.businessId } })
        const rows: { businessId: string; role: string; permission: string; allowed: boolean }[] = []
        for (const role of ROLES) {
          if (role === "OWNER" || !isRole(role)) continue
          for (const permission of ASSIGNABLE) {
            const allowed = wanted.has(`${role}|${permission}`)
            if (allowed !== can(role, permission)) rows.push({ businessId: ctx.businessId, role, permission, allowed })
          }
        }
        changes = rows.length
        if (rows.length) await tx.permissionGrant.createMany({ data: rows })
        await tx.auditLog.create({
          data: { businessId: ctx.businessId, userId: ctx.userId, action: "PERMISSIONS", entity: "PermissionGrant", detail: String(rows.length) },
        })
      })
      res.json({ ok: true, changes })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
