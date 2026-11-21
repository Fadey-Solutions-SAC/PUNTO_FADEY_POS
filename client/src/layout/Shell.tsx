import { useEffect, useState, type ComponentType, type CSSProperties } from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import {
  ArrowLeftRight,
  BadgeDollarSign,
  Barcode,
  Bell,
  BookOpen,
  Boxes,
  ClipboardCheck,
  FileBarChart,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Package,
  PackageMinus,
  PackagePlus,
  PieChart,
  Ruler,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Tags,
  Truck,
  Undo2,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  X,
  CircleMinus,
  CirclePlus,
} from "lucide-react"
import type { PanelBootstrap } from "../api"
import { isServerReachable, logout, SERVER_EVENT } from "../api"
import { formatAppPath } from "../nav"
import { clearOfflineCache, OFFLINE_EVENT, pendingCount } from "../offline"

type LucideIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

const THEMES: Record<
  string,
  { panel: string; button: string; accent: string; ink: string; soft: string; dim: string; hover: string; buttonInk: string }
> = {
  azul: { panel: "#0c2340", button: "#0f5f73", accent: "#148a84", ink: "#ffffff", soft: "#cbd5e1", dim: "#94a3b8", hover: "rgba(255,255,255,0.12)", buttonInk: "#ffffff" },
  celeste: { panel: "#7ed8f5", button: "#5dcee8", accent: "#0369a1", ink: "#083344", soft: "#0e4a5c", dim: "#155e75", hover: "rgba(8,51,68,0.1)", buttonInk: "#083344" },
  verde: { panel: "#b7f0c4", button: "#8ee4a8", accent: "#15803d", ink: "#052e16", soft: "#14532d", dim: "#166534", hover: "rgba(5,46,22,0.1)", buttonInk: "#052e16" },
  negro: { panel: "#111111", button: "#1c1c1c", accent: "#a3a3a3", ink: "#ffffff", soft: "#d4d4d4", dim: "#a3a3a3", hover: "rgba(255,255,255,0.12)", buttonInk: "#ffffff" },
  morado: { panel: "#4c1d6b", button: "#6d28a8", accent: "#e9d5ff", ink: "#ffffff", soft: "#e9d5ff", dim: "#d8b4fe", hover: "rgba(255,255,255,0.12)", buttonInk: "#ffffff" },
  violeta: { panel: "#5b4dff", button: "#7c6bff", accent: "#ddd6fe", ink: "#ffffff", soft: "#ede9fe", dim: "#c4b5fd", hover: "rgba(255,255,255,0.14)", buttonInk: "#ffffff" },
}

const VITE_HREF: Record<string, string> = {
  "/": "/",
  "/ventas": "/ventas",
  "/ventas/historial": "/ventas/historial",
  "/ventas/devoluciones": "/ventas/devoluciones",
  "/ventas/anulaciones": "/ventas/anulaciones",
  "/caja": "/caja",
  "/caja/historial": "/caja/historial",
  "/caja/ingreso": "/caja/ingreso",
  "/caja/egreso": "/caja/egreso",
  "/caja/movimientos": "/caja",
  "/caja/ingresos": "/caja",
  "/caja/cierre": "/caja/cierre",
  "/productos": "/productos",
  "/productos/nuevo": "/productos/nuevo",
  "/productos/unidades": "/productos/unidades",
  "/productos/categorias": "/productos/categorias",
  "/productos/presentaciones": "/productos/presentaciones",
  "/productos/codigos": "/productos/codigos",
  "/productos/precios": "/productos/precios",
  "/clientes": "/clientes",
  "/clientes/historial": "/clientes/historial",
  "/clientes/creditos": "/clientes/creditos",
  "/inventario/alertas": "/inventario/alertas",
  "/inventario/almacenes": "/inventario/almacenes",
  "/inventario/kardex": "/inventario/kardex",
  "/inventario/mermas": "/inventario/mermas",
  "/inventario/entradas": "/inventario/entradas",
  "/inventario/transferencias": "/inventario/transferencias",
  "/inventario/ajustes": "/inventario/ajustes",
  "/inventario/conteo": "/inventario/conteo",
  "/inventario/informes": "/inventario/informes",
  "/compras/proveedores": "/compras/proveedores",
  "/compras/requerimiento": "/compras/requerimiento",
  "/compras/recepcion": "/compras/recepcion",
  "/compras/historial": "/compras/historial",
  "/compras/por-pagar": "/compras/por-pagar",
  "/facturacion": "/facturacion",
  "/informes": "/informes",
  "/configuracion": "/configuracion",
}

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/ventas": Wallet,
  "/ventas/historial": History,
  "/ventas/devoluciones": Undo2,
  "/ventas/anulaciones": Undo2,
  "/caja": Wallet,
  "/caja/movimientos": ArrowLeftRight,
  "/caja/ingresos": BadgeDollarSign,
  "/caja/ingreso": CirclePlus,
  "/caja/egreso": CircleMinus,
  "/caja/cierre": Lock,
  "/caja/historial": History,
  "/productos": Package,
  "/productos/unidades": Ruler,
  "/productos/categorias": Tags,
  "/productos/presentaciones": Boxes,
  "/productos/codigos": Barcode,
  "/productos/precios": BadgeDollarSign,
  "/inventario/transferencias": ArrowLeftRight,
  "/inventario/ajustes": SlidersHorizontal,
  "/inventario/conteo": ClipboardCheck,
  "/inventario/informes": FileBarChart,
  "/inventario/kardex": BookOpen,
  "/inventario/mermas": PackageMinus,
  "/inventario/entradas": PackagePlus,
  "/inventario/alertas": Bell,
  "/inventario/almacenes": Warehouse,
  "/compras/proveedores": Truck,
  "/compras/requerimiento": ClipboardList,
  "/compras/recepcion": ShoppingBag,
  "/compras/historial": History,
  "/compras/por-pagar": BadgeDollarSign,
  "/clientes": Users,
  "/clientes/historial": History,
  "/clientes/creditos": Wallet,
  "/facturacion": FileText,
  "/informes": PieChart,
  "/configuracion": Settings,
}

const GROUP_NOTE: Record<string, string> = {
  General: "Resumen del negocio",
  Ventas: "Caja del día, historial y devoluciones",
  Caja: "Apertura, movimientos y cierre",
  Productos: "Productos, marcas y presentaciones",
  "Inventario y almacén": "Almacenes, movimientos y alertas",
  "Compras y proveedores": "Requerimiento, recepción e historial",
  Clientes: "Clientes e historial",
  "Facturación electrónica": "Comprobantes del negocio",
  Informes: "Reportes de ventas y caja",
  Configuración: "Datos y opciones del sistema",
}

function themeStyle(id?: string | null): CSSProperties {
  const theme = THEMES[id ?? "azul"] ?? THEMES.azul
  return {
    "--pf-panel": theme.panel,
    "--pf-panel-ink": theme.ink,
    "--pf-panel-soft": theme.soft,
    "--pf-panel-dim": theme.dim,
    "--pf-panel-hover": theme.hover,
    "--pf-button": theme.button,
    "--pf-button-ink": theme.buttonInk,
    "--pf-accent": theme.accent,
    "--pf-navy": theme.panel,
  } as CSSProperties
}

function screenTitle(pathname: string, navLabel?: string) {
  if (pathname === "/productos/nuevo") return "Nuevo producto"
  if (/^\/productos\/(?!nuevo$|unidades$|presentaciones$|codigos$|precios$|categorias$)[^/]+$/.test(pathname)) return "Editar producto"
  if (/^\/ventas\/(?!historial$|devoluciones$|anulaciones$|sincronizar$|pendiente$)[^/]+\/ticket$/.test(pathname)) return "Ticket"
  if (/^\/ventas\/(?!historial$|devoluciones$|anulaciones$|sincronizar$|pendiente$)[^/]+$/.test(pathname)) return "Venta"
  if (pathname === "/ventas/sincronizar") return "Ventas por sincronizar"
  if (pathname.startsWith("/ventas/pendiente/")) return "Venta sin conexión"
  if (pathname === "/compras/por-pagar") return "Pago pendiente"
  if (/^\/compras\/(?!proveedores$|requerimiento$|recepcion$|historial$|por-pagar$)[^/]+$/.test(pathname)) return "Compra"
  if (pathname === "/caja/cierre") return "Cierre de caja"
  if (pathname === "/caja/historial") return "Historial de caja"
  if (pathname === "/caja") return "Caja"
  if (pathname === "/ventas/historial") return "Historial de ventas"
  if (pathname === "/ventas/devoluciones") return "Devoluciones"
  if (pathname === "/ventas/anulaciones") return "Anulaciones"
  if (pathname === "/compras/historial") return "Historial de compras"
  if (pathname === "/clientes/historial") return "Historial de clientes"
  if (pathname === "/clientes/creditos") return "Cuentas por cobrar"
  if (pathname === "/inventario/transferencias") return "Transferencias"
  if (pathname === "/productos/unidades") return "Unidades"
  if (pathname === "/productos/categorias") return "Categorías y marcas"
  if (pathname === "/productos/codigos") return "Códigos de barras"
  if (pathname === "/productos/precios") return "Listas de precios"
  if (pathname === "/facturacion") return "Facturación electrónica"
  return navLabel ?? "Punto Fadey"
}

function resolveTo(href: string) {
  return VITE_HREF[href] ?? formatAppPath(href)
}

export function Shell({ panel }: { panel: PanelBootstrap }) {
  const location = useLocation()
  const pathname = location.pathname
  const [open, setOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [noticesOpen, setNoticesOpen] = useState(false)
  const [rail, setRail] = useState(false)
  const [online, setOnline] = useState(true)
  const [queued, setQueued] = useState(() => pendingCount())

  useEffect(() => {
    const sync = () => setQueued(pendingCount())
    window.addEventListener(OFFLINE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(OFFLINE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const navItems = panel.nav.flatMap((group) => group.items)
  const activeHref = navItems
    .filter((item) => {
      const to = resolveTo(item.href).split("?")[0]
      return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`)
    })
    .sort((a, b) => resolveTo(b.href).length - resolveTo(a.href).length)[0]?.href
  const navLabel = navItems.find((item) => item.href === activeHref)?.label
  const section = screenTitle(pathname, navLabel)
  const accountDetail = panel.user.detail ?? panel.user.roleLabel ?? panel.user.role
  // El menú siempre muestra la marca Punto Fadey (igual que el ícono del navegador).
  // El logo de cada negocio se usa en su pantalla de inicio de sesión.
  const logoSrc = "/brand/punto-fadey.jpg"
  const sideWidth = rail ? "w-[4.25rem]" : "w-[14.5rem] max-w-[86vw]"
  const hasConfig = navItems.some((item) => item.href === "/configuracion")
  const notices = panel.notices ?? []

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine && isServerReachable())
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    window.addEventListener(SERVER_EVENT, sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
      window.removeEventListener(SERVER_EVENT, sync)
    }
  }, [])

  useEffect(() => {
    setOpen(false)
    setAccountOpen(false)
    setNoticesOpen(false)
  }, [pathname])

  function toggleRail() {
    if (window.innerWidth < 1024 && !open) {
      setOpen(true)
      return
    }
    setRail((value) => !value)
  }

  async function onLogout() {
    await logout().catch(() => undefined)
    clearOfflineCache()
    try {
      localStorage.removeItem("pf-offline-boot-v1")
      localStorage.removeItem("pf-offline-sale-status-v1")
    } catch {
      /* noop */
    }
    window.location.assign("/login")
  }

  const menu = (
    <nav className={`min-h-0 flex-1 overflow-y-auto overscroll-contain py-3 ${rail ? "space-y-2 px-2" : "space-y-5 px-2"}`}>
      {panel.nav.map((group) => {
        const direct = group.items.length === 1 && group.items[0].href === "/configuracion"
        return (
          <div key={group.title}>
            {rail || direct ? null : (
              <div className="mb-1.5 px-2">
                <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pf-panel-dim)]">{group.title}</p>
                {GROUP_NOTE[group.title] ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--pf-panel-dim)]">{GROUP_NOTE[group.title]}</p>
                ) : null}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.href] ?? Package
                const to = resolveTo(item.href)
                const active = item.href === activeHref
                return (
                  <NavLink
                    key={item.href}
                    to={to}
                    end={to === "/"}
                    title={item.label}
                    onClick={() => setOpen(false)}
                    className={`flex items-center rounded-xl text-[13px] transition ${
                      rail ? "justify-center px-0 py-2.5" : "gap-2 px-2 py-2"
                    } ${
                      active
                        ? "bg-[var(--pf-panel-hover)] text-[var(--pf-panel-ink)]"
                        : "text-[var(--pf-panel-soft)] hover:bg-[var(--pf-panel-hover)] hover:text-[var(--pf-panel-ink)]"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} className={active ? "text-[var(--pf-panel-ink)]" : "text-[var(--pf-panel-dim)]"} />
                    {rail ? null : <span className="truncate">{item.label}</span>}
                  </NavLink>
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f3f6fb]" style={themeStyle(panel.theme)}>
      <header className="z-40 flex h-14 shrink-0 bg-[var(--pf-panel)] text-[var(--pf-panel-ink)]">
        <div
          className={`relative flex h-full shrink-0 items-center bg-[var(--pf-panel)] transition-[width] duration-200 ${
            rail ? "w-[4.25rem] justify-center px-1" : "gap-2.5 px-2.5 sm:px-3 lg:w-[14.5rem]"
          }`}
        >
          {rail ? null : <img src={logoSrc} alt="Punto Fadey" className="size-9 shrink-0 rounded-full object-cover" />}
          {rail ? null : <p className="hidden min-w-0 flex-1 truncate text-[15px] font-semibold sm:block">Punto Fadey</p>}
          <button
            className="shrink-0 rounded-lg p-1.5 text-[var(--pf-panel-soft)] hover:bg-[var(--pf-panel-hover)]"
            onClick={toggleRail}
            type="button"
            aria-label={rail ? "Mostrar el menú" : "Dejar solo los iconos"}
          >
            <Menu size={18} />
          </button>
          <span aria-hidden className="absolute inset-y-0 right-0 w-px bg-[var(--pf-accent)]" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-[var(--pf-accent)]" />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 sm:gap-3 lg:px-4">
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--pf-panel-ink)] sm:text-base">{section}</h1>

          <span
            className={`hidden items-center gap-1.5 text-xs md:inline-flex ${online ? "text-emerald-200" : "text-amber-200"}`}
            title={online ? "En línea" : "Sin conexión"}
          >
            <span className={`size-1.5 rounded-full ${online ? "bg-emerald-300" : "bg-amber-300"}`} />
            {online ? "En línea" : "Sin conexión"}
          </span>
          {!online ? (
            <span className="inline-flex items-center rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 md:hidden">
              Sin red
            </span>
          ) : null}
          {queued > 0 ? (
            <NavLink
              to="/ventas/sincronizar"
              className="inline-flex items-center gap-1 rounded-full bg-sky-400 px-2 py-0.5 text-[11px] font-bold text-sky-950 shadow-sm hover:bg-sky-300"
              title="Ventas guardadas sin conexión"
            >
              ⟳ {queued}
              <span className="hidden sm:inline">por sincronizar</span>
            </NavLink>
          ) : null}

          <div className="relative">
            <button
              type="button"
              className="relative rounded-lg p-1.5 text-[var(--pf-panel-soft)] hover:bg-[var(--pf-panel-hover)]"
              onClick={() => {
                setNoticesOpen((value) => !value)
                setAccountOpen(false)
              }}
              aria-label="Notificaciones"
            >
              <Bell size={18} />
              {notices.length > 0 ? (
                <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-[var(--pf-accent)] px-1 text-[10px] font-semibold text-white">
                  {notices.length}
                </span>
              ) : null}
            </button>
            {noticesOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-72 max-w-[90vw] rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-lg">
                <p className="px-2 py-1 text-xs font-medium text-slate-500">Avisos · v{panel.version ?? "…"}</p>
                {notices.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500">No hay notificaciones.</p>
                ) : (
                  <ul className="max-h-72 space-y-1 overflow-y-auto">
                    {notices.map((notice) => (
                      <li key={notice.id}>
                        <NavLink
                          to={resolveTo(notice.href)}
                          className="block rounded-lg px-2 py-2 hover:bg-slate-50"
                          onClick={() => setNoticesOpen(false)}
                        >
                          <p className="font-medium text-[var(--pf-navy)]">{notice.title}</p>
                          <p className="text-xs text-slate-500">{notice.detail}</p>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1 hover:bg-[var(--pf-panel-hover)] sm:pr-2"
              onClick={() => {
                setAccountOpen((value) => !value)
                setNoticesOpen(false)
              }}
              aria-label="Opciones de cuenta"
            >
              <span className="grid size-8 place-items-center rounded-full bg-white/10">
                <UserRound size={15} />
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-36 truncate text-sm font-medium leading-tight">{panel.user.name}</span>
                <span className="block text-[11px] text-[var(--pf-panel-soft)]">{accountDetail}</span>
              </span>
            </button>
            {accountOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-lg">
                <p className="px-2 py-1 text-xs text-slate-500">
                  {panel.user.name} · {accountDetail}
                </p>
                {hasConfig ? (
                  <NavLink
                    to="/configuracion"
                    className="block rounded-lg px-2 py-2 hover:bg-slate-50"
                    onClick={() => setAccountOpen(false)}
                  >
                    Configuración
                  </NavLink>
                ) : null}
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                  type="button"
                  onClick={onLogout}
                >
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`fixed bottom-0 left-0 top-14 z-40 flex flex-col overflow-hidden bg-[var(--pf-panel)] text-[var(--pf-panel-soft)] transition-[width,transform] duration-200 lg:static lg:z-auto lg:h-full lg:min-h-0 lg:shrink-0 ${sideWidth} ${
            open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <button
            className="absolute right-2 top-2 rounded-lg p-1 text-[var(--pf-panel-soft)] hover:bg-[var(--pf-panel-hover)] lg:hidden"
            onClick={() => setOpen(false)}
            type="button"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
          {menu}
        </aside>
        {open ? (
          <button
            className="fixed bottom-0 left-0 right-0 top-14 z-30 bg-[var(--pf-panel)]/50 lg:hidden"
            onClick={() => setOpen(false)}
            type="button"
            aria-label="Cerrar menú"
          />
        ) : null}
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
