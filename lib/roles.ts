import { AppError } from "@/lib/errors"

export const ROLES = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "WAREHOUSE", "SELLER"] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  MANAGER: "Encargado",
  CASHIER: "Cajero",
  WAREHOUSE: "Almacenero",
  SELLER: "Vendedor",
}

export const PERMISSIONS = [
  "sell",
  "discountOver",
  "credit",
  "cash",
  "cashClose",
  "catalogWrite",
  "priceWrite",
  "inventoryMove",
  "adjust",
  "transfer",
  "settings",
  "users",
  "permissions",
  "voidSale",
  "returnSale",
  "customers",
  "purchases",
  "reports",
  "billing",
  "backup",
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_LABEL: Record<Permission, string> = {
  sell: "Ventas",
  discountOver: "Descuentos sobre el tope",
  credit: "Créditos",
  cash: "Apertura y movimientos de caja",
  cashClose: "Cierre de caja",
  catalogWrite: "Editar catálogo",
  priceWrite: "Modificar precios",
  inventoryMove: "Entradas y salidas",
  adjust: "Ajustes de stock",
  transfer: "Transferencias",
  settings: "Configuración",
  users: "Usuarios",
  permissions: "Permisos",
  voidSale: "Anulaciones",
  returnSale: "Devoluciones",
  customers: "Clientes",
  purchases: "Compras",
  reports: "Informes",
  billing: "Facturación electrónica",
  backup: "Copias de seguridad",
}

const MATRIX = {
  sell: ["OWNER", "ADMIN", "MANAGER", "CASHIER", "SELLER"],
  discountOver: ["OWNER", "ADMIN", "MANAGER"],
  credit: ["OWNER", "ADMIN", "MANAGER"],
  cash: ["OWNER", "ADMIN", "MANAGER", "CASHIER", "SELLER"],
  cashClose: ["OWNER", "ADMIN", "MANAGER", "CASHIER"],
  catalogWrite: ["OWNER", "ADMIN", "MANAGER"],
  priceWrite: ["OWNER", "ADMIN", "MANAGER"],
  inventoryMove: ["OWNER", "ADMIN", "MANAGER", "WAREHOUSE"],
  adjust: ["OWNER", "ADMIN"],
  transfer: ["OWNER", "ADMIN", "MANAGER", "WAREHOUSE"],
  settings: ["OWNER", "ADMIN"],
  users: ["OWNER"],
  permissions: ["OWNER"],
  voidSale: ["OWNER", "ADMIN", "MANAGER"],
  returnSale: ["OWNER", "ADMIN", "MANAGER", "CASHIER"],
  customers: ["OWNER", "ADMIN", "MANAGER", "CASHIER", "SELLER"],
  purchases: ["OWNER", "ADMIN", "MANAGER", "WAREHOUSE"],
  reports: ["OWNER", "ADMIN", "MANAGER"],
  billing: ["OWNER", "ADMIN"],
  backup: ["OWNER", "ADMIN"],
} as const satisfies Record<Permission, readonly Role[]>

export type PermissionGrant = { role: string; permission: string; allowed: boolean; userId?: string }

type Actor = Role | { role: Role; grants?: PermissionGrant[] }

export function can(role: Role, permission: Permission, grants?: PermissionGrant[]) {
  if (role === "OWNER") return true
  if (permission === "users" || permission === "permissions") return false
  const personal = grants?.filter((item) => item.userId)
  if (personal && personal.length > 0) return personal.some((item) => item.permission === permission && item.allowed)
  const grant = grants?.find((item) => item.role === role && item.permission === permission)
  if (grant) return grant.allowed
  return (MATRIX[permission] as readonly Role[]).includes(role)
}

export function assertCan(actor: Actor, permission: Permission) {
  const role = typeof actor === "string" ? actor : actor.role
  const grants = typeof actor === "string" ? undefined : actor.grants
  if (!can(role, permission, grants)) throw new AppError("No tienes permiso para esta operación")
}

export function assertCanAny(actor: Actor, permissions: Permission[]) {
  const role = typeof actor === "string" ? actor : actor.role
  const grants = typeof actor === "string" ? undefined : actor.grants
  if (!permissions.some((permission) => can(role, permission, grants))) {
    throw new AppError("No tienes permiso para esta operación")
  }
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}
