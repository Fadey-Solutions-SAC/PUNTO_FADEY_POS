"use client";

import { logoutAction } from "@/actions/auth";
import { Notifications } from "@/components/notifications";
import type { NavGroup } from "@/lib/nav";
import type { SystemNotice } from "@/lib/notices";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { themeStyle } from "@/lib/themes";
import ArrowLeftRight from "lucide-react/icons/arrow-left-right";
import BadgeDollarSign from "lucide-react/icons/badge-dollar-sign";
import Barcode from "lucide-react/icons/barcode";
import Bell from "lucide-react/icons/bell";
import BookOpen from "lucide-react/icons/book-open";
import Boxes from "lucide-react/icons/boxes";
import ClipboardList from "lucide-react/icons/clipboard-list";
import FileText from "lucide-react/icons/file-text";
import History from "lucide-react/icons/history";
import LayoutDashboard from "lucide-react/icons/layout-dashboard";
import Lock from "lucide-react/icons/lock";
import LogOut from "lucide-react/icons/log-out";
import Menu from "lucide-react/icons/menu";
import Package from "lucide-react/icons/package";
import PieChart from "lucide-react/icons/pie-chart";
import Ruler from "lucide-react/icons/ruler";
import Settings from "lucide-react/icons/settings";
import ShoppingBag from "lucide-react/icons/shopping-bag";
import SlidersHorizontal from "lucide-react/icons/sliders-horizontal";
import Truck from "lucide-react/icons/truck";
import Undo2 from "lucide-react/icons/undo-2";
import UserRound from "lucide-react/icons/user-round";
import Users from "lucide-react/icons/users";
import Wallet from "lucide-react/icons/wallet";
import Warehouse from "lucide-react/icons/warehouse";
import X from "lucide-react/icons/x";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";

type LucideIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/ventas": Wallet,
  "/ventas/pendientes": ClipboardList,
  "/ventas/historial": History,
  "/ventas/devoluciones": Undo2,
  "/ventas/anulaciones": Undo2,
  "/caja": Wallet,
  "/caja/movimientos": ArrowLeftRight,
  "/caja/ingresos": BadgeDollarSign,
  "/caja/cierre": Lock,
  "/caja/historial": History,
  "/productos": Package,
  "/productos/unidades": Ruler,
  "/productos/presentaciones": Boxes,
  "/productos/codigos": Barcode,
  "/productos/precios": BadgeDollarSign,
  "/inventario/transferencias": ArrowLeftRight,
  "/inventario/ajustes": SlidersHorizontal,
  "/inventario/kardex": BookOpen,
  "/inventario/alertas": Bell,
  "/inventario/almacenes": Warehouse,
  "/compras/proveedores": Truck,
  "/compras/requerimiento": ClipboardList,
  "/compras/recepcion": ShoppingBag,
  "/compras/historial": History,
  "/clientes": Users,
  "/clientes/historial": History,
  "/clientes/creditos": Wallet,
  "/facturacion": FileText,
  "/informes": PieChart,
  "/configuracion": Settings,
};

function screenTitle(pathname: string, navLabel?: string) {
  if (pathname === "/productos/nuevo") return "Nuevo producto";
  if (/^\/productos\/(?!nuevo$|unidades$|presentaciones$|codigos$|precios$|categorias$|marcas$)[^/]+$/.test(pathname)) return "Editar producto";
  if (pathname === "/ventas/pendientes") return "Ventas pendientes";
  if (/^\/ventas\/(?!pendientes$|historial$|devoluciones$|anulaciones$)[^/]+$/.test(pathname)) return "Venta";
  if (pathname === "/caja/movimientos") return "Movimientos de caja";
  if (pathname === "/caja/ingresos") return "Ingresos y egresos";
  if (pathname === "/caja/cierre") return "Cierre de caja";
  if (pathname === "/caja/historial") return "Historial de caja";
  if (/^\/compras\/(?!proveedores$|requerimiento$|recepcion$|historial$)[^/]+$/.test(pathname)) return "Compra";
  if (/^\/facturacion\/[^/]+/.test(pathname)) return "Comprobante";
  return navLabel ?? "Punto Fadey";
}

const GROUP_NOTE: Record<string, string> = {
  General: "Resumen del negocio",
  Ventas: "Caja del día, historial y devoluciones",
  Caja: "Apertura, movimientos y cierre",
  Productos: "Catálogo, precios y códigos",
  "Inventario y almacén": "Almacenes, movimientos y alertas",
  "Compras y proveedores": "Requerimiento, recepción e historial",
  Clientes: "Registro, historial y créditos",
  "Facturación electrónica": "Comprobantes del negocio",
  Informes: "Reportes de ventas y caja",
  Configuración: "Datos y opciones del sistema",
};

export function AppShell({
  nav,
  user,
  notices,
  version,
  theme = "azul",
  logo,
  children,
}: {
  nav: NavGroup[];
  user: { name: string; role: Role; detail?: string };
  notices: SystemNotice[];
  version: string;
  theme?: string;
  logo?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeHref = nav
    .flatMap((group) => group.items)
    .filter((item) => (item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const navLabel = nav.flatMap((group) => group.items).find((item) => item.href === activeHref)?.label;
  const section = screenTitle(pathname, navLabel);
  const accountDetail = user.detail ?? ROLE_LABEL[user.role];
  const logoSrc = logo || "/brand/punto-fadey.jpg";
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [rail, setRail] = useState(false);
  const sideWidth = rail ? "w-[4.25rem]" : "w-[14.5rem] max-w-[86vw]";

  function toggleRail() {
    if (window.innerWidth < 1024 && !open) {
      setOpen(true);
      return;
    }
    setRail((value) => !value);
  }

  const menu = (
    <nav className={`pf-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain py-3 ${rail ? "space-y-2 px-2" : "space-y-5 px-2"}`}>
      {nav.map((group) => {
        const direct = group.items.length === 1 && group.items[0].href === "/configuracion";
        return (
        <div key={group.title}>
          {rail || direct ? null : (
            <div className="mb-1.5 px-2">
              <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pf-panel-dim)]">{group.title}</p>
              {GROUP_NOTE[group.title] ? <p className="mt-0.5 text-[11px] leading-snug text-[var(--pf-panel-dim)]">{GROUP_NOTE[group.title]}</p> : null}
            </div>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.href] ?? Package;
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  prefetch={process.env.NODE_ENV === "production"}
                  onClick={() => setOpen(false)}
                  className={`flex items-center rounded-xl text-[13px] transition ${rail ? "justify-center px-0 py-2.5" : "gap-2 px-2 py-2"} ${active ? "bg-[var(--pf-panel-hover)] text-[var(--pf-panel-ink)]" : "text-[var(--pf-panel-soft)] hover:bg-[var(--pf-panel-hover)] hover:text-[var(--pf-panel-ink)]"}`}
                >
                  <Icon size={18} strokeWidth={1.75} className={active ? "text-[var(--pf-panel-ink)]" : "text-[var(--pf-panel-dim)]"} />
                  {rail ? null : <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
        );
      })}
    </nav>
  );

  return (
    <div className="pf-shell flex h-screen flex-col overflow-hidden bg-canvas" style={themeStyle(theme)}>
      <header className="no-print z-40 flex h-14 shrink-0 bg-navy text-[var(--pf-panel-ink)]">
        <div className={`relative flex h-full shrink-0 items-center bg-navy transition-[width] duration-200 ${rail ? "w-[4.25rem] justify-center px-1" : "gap-2.5 px-2.5 sm:px-3 lg:w-[14.5rem]"}`}>
          {rail ? null : <img src={logoSrc} alt="Punto Fadey" className="size-9 shrink-0 rounded-full object-cover" />}
          {rail ? null : <p className="hidden min-w-0 flex-1 truncate text-[15px] font-semibold sm:block">Punto Fadey</p>}
          <button className="shrink-0 rounded-lg p-1.5 text-[var(--pf-panel-soft)] hover:bg-[var(--pf-panel-hover)]" onClick={toggleRail} type="button" aria-label={rail ? "Mostrar el menú" : "Dejar solo los iconos"}>
            <Menu size={18} />
          </button>
          <span aria-hidden className="absolute inset-y-0 right-0 w-px bg-[var(--pf-accent)]" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-[var(--pf-accent)]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 sm:gap-3 lg:px-4">
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--pf-panel-ink)] sm:text-base">{section}</h1>
        <ConnectionMark />
        <Notifications notices={notices} version={version} />
        <div className="relative">
          <button type="button" className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1 hover:bg-[var(--pf-panel-hover)] sm:pr-2" onClick={() => setAccountOpen((value) => !value)} aria-label="Opciones de cuenta">
            <span className="grid size-8 place-items-center rounded-full bg-white/10"><UserRound size={15} /></span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-36 truncate text-sm font-medium leading-tight">{user.name}</span>
              <span className="block text-[11px] text-[var(--pf-panel-soft)]">{accountDetail}</span>
            </span>
          </button>
          {accountOpen ? (
            <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-lg">
              <p className="px-2 py-1 text-xs text-slate-500">{user.name} · {accountDetail}</p>
              {nav.some((group) => group.items.some((item) => item.href === "/configuracion")) ? (
                <Link href="/configuracion" className="block rounded-lg px-2 py-2 hover:bg-slate-50" onClick={() => setAccountOpen(false)}>Configuración</Link>
              ) : null}
              <form action={logoutAction}>
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50" type="submit">
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </form>
            </div>
          ) : null}
        </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className={`no-print fixed bottom-0 left-0 top-14 z-40 flex flex-col overflow-hidden bg-navy text-[var(--pf-panel-soft)] transition-[width,transform] duration-200 lg:static lg:z-auto lg:h-full lg:min-h-0 lg:shrink-0 ${sideWidth} ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
          <button className="absolute right-2 top-2 rounded-lg p-1 text-[var(--pf-panel-soft)] hover:bg-[var(--pf-panel-hover)] lg:hidden" onClick={() => setOpen(false)} type="button" aria-label="Cerrar menú">
            <X size={18} />
          </button>
          {menu}
        </aside>
        {open ? <button className="fixed bottom-0 left-0 right-0 top-14 z-30 bg-navy/50 lg:hidden" onClick={() => setOpen(false)} type="button" aria-label="Cerrar menú" /> : null}
        <main className="pf-main min-w-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

function ConnectionMark() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return (
    <span className={`hidden items-center gap-1.5 text-xs md:inline-flex ${online ? "text-emerald-200" : "text-amber-200"}`} title={online ? "En línea" : "Sin conexión"}>
      <span className={`size-1.5 rounded-full ${online ? "bg-emerald-300" : "bg-amber-300"}`} />
      {online ? "En línea" : "Sin conexión"}
    </span>
  );
}
