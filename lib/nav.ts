import { can, type Permission, type PermissionGrant, type Role } from "@/lib/roles"

export type NavItem = {
  href: string
  label: string
  permission?: Permission
  anyOf?: Permission[]
}

export type NavGroup = {
  title: string
  items: NavItem[]
}

const NAV: NavGroup[] = [
  { title: "General", items: [{ href: "/", label: "Panel principal" }] },
  {
    title: "Ventas",
    items: [
      { href: "/ventas", label: "Caja", anyOf: ["sell", "cash"] },
      { href: "/ventas/historial", label: "Historial", permission: "sell" },
      { href: "/ventas/devoluciones", label: "Devoluciones", permission: "returnSale" },
      { href: "/ventas/anulaciones", label: "Anulaciones", permission: "voidSale" },
    ],
  },
  {
    title: "Productos",
    items: [
      { href: "/productos", label: "Productos y marcas" },
      { href: "/productos/presentaciones", label: "Presentaciones" },
    ],
  },
  {
    title: "Inventario y almacén",
    items: [
      { href: "/inventario/conteo", label: "Toma de inventario", anyOf: ["adjust", "reports"] },
      { href: "/inventario/entradas", label: "Entradas", permission: "inventoryMove" },
      { href: "/inventario/transferencias", label: "Transferencias", permission: "transfer" },
      { href: "/inventario/ajustes", label: "Ajustes", permission: "adjust" },
      { href: "/inventario/kardex", label: "Kardex" },
      { href: "/inventario/mermas", label: "Mermas y pérdidas", anyOf: ["inventoryMove", "reports"] },
      { href: "/inventario/alertas", label: "Alertas de stock" },
      { href: "/inventario/almacenes", label: "Almacenes" },
    ],
  },
  {
    title: "Compras y proveedores",
    items: [
      { href: "/compras/proveedores", label: "Proveedores", permission: "purchases" },
      { href: "/compras/requerimiento", label: "Requerimiento", permission: "purchases" },
      { href: "/compras/recepcion", label: "Recepción", permission: "purchases" },
      { href: "/compras/historial", label: "Historial", permission: "purchases" },
      { href: "/compras/por-pagar", label: "Por pagar", permission: "purchases" },
    ],
  },
  {
    title: "Clientes",
    items: [
      { href: "/clientes", label: "Clientes", permission: "customers" },
      { href: "/clientes/historial", label: "Historial", permission: "customers" },
      { href: "/clientes/creditos", label: "Créditos", permission: "customers" },
    ],
  },
  { title: "Facturación electrónica", items: [{ href: "/facturacion", label: "Comprobantes", permission: "billing" }] },
  { title: "Informes", items: [{ href: "/informes", label: "Informes", permission: "reports" }] },
  { title: "Configuración", items: [{ href: "/configuracion", label: "Configuración", permission: "settings" }] },
]

export function navigation(role: Role, grants?: PermissionGrant[]) {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.anyOf?.length) return item.anyOf.some((permission) => can(role, permission, grants))
      return !item.permission || can(role, item.permission, grants)
    }),
  })).filter((group) => group.items.length > 0)
}
