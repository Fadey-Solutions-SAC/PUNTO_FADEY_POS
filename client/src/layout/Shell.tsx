import { useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import type { PanelBootstrap } from "../api"
import { logout } from "../api"
import { formatAppPath } from "../nav"

const VITE_HREF: Record<string, string> = {
  "/": "/",
  "/ventas": "/ventas",
  "/ventas/historial": "/ventas/historial",
  "/ventas/devoluciones": "/ventas/devoluciones",
  "/ventas/anulaciones": "/ventas/historial?status=VOIDED",
  "/caja": "/caja",
  "/caja/historial": "/caja/historial",
  "/caja/movimientos": "/caja",
  "/caja/cierre": "/caja/cierre",
  "/productos": "/productos",
  "/productos/nuevo": "/productos/nuevo",
  "/productos/unidades": "/productos/unidades",
  "/productos/presentaciones": "/productos/presentaciones",
  "/productos/codigos": "/productos/codigos",
  "/productos/precios": "/productos/precios",
  "/clientes": "/clientes",
  "/clientes/historial": "/clientes/historial",
  "/clientes/creditos": "/clientes/creditos",
  "/inventario/alertas": "/inventario/alertas",
  "/inventario/almacenes": "/inventario/almacenes",
  "/inventario/kardex": "/inventario/kardex",
  "/inventario/transferencias": "/inventario/transferencias",
  "/inventario/ajustes": "/inventario/ajustes",
  "/compras/proveedores": "/compras/proveedores",
  "/compras/requerimiento": "/compras/requerimiento",
  "/compras/recepcion": "/compras/recepcion",
  "/compras/historial": "/compras/historial",
  "/facturacion": "/facturacion",
  "/informes": "/informes",
  "/configuracion": "/configuracion",
}

export function Shell({ panel }: { panel: PanelBootstrap }) {
  const [menuOpen, setMenuOpen] = useState(false)

  async function onLogout() {
    await logout().catch(() => undefined)
    window.location.assign("/login")
  }

  function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <>
        {panel.nav.map((group) => (
          <div key={group.title}>
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{group.title}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const to = VITE_HREF[item.href] ?? formatAppPath(item.href)
                const migrated = Boolean(VITE_HREF[item.href])
                return (
                  <NavLink
                    key={item.href}
                    to={to}
                    end={to === "/"}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `block rounded-xl px-3 py-2 text-sm ${
                        isActive ? "bg-white/15 font-medium text-white" : "text-slate-300 hover:bg-white/10"
                      } ${migrated ? "" : "opacity-60"}`
                    }
                    title={migrated ? undefined : "Pendiente de migrar"}
                  >
                    {item.label}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="flex min-h-dvh bg-[#f3f6fb] text-slate-900">
      <aside className="hidden w-60 shrink-0 flex-col bg-[var(--pf-navy)] text-white md:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          <img src="/brand/punto-fadey.jpg" alt="" className="size-9 rounded-full object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Punto Fadey</p>
            <p className="truncate text-[11px] text-slate-300">{panel.business.name}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          <NavGroups />
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-xs text-slate-300">
          <p className="truncate font-medium text-white">{panel.user.name}</p>
          <p className="truncate">
            {panel.branch.name} · {panel.warehouse.name}
          </p>
          <button type="button" onClick={onLogout} className="mt-2 text-[var(--pf-accent)] underline-offset-2 hover:underline">
            Salir
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="grid size-10 place-items-center rounded-xl border border-slate-200 text-lg md:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Punto Fadey</p>
              <p className="font-semibold text-[var(--pf-navy)]">{panel.business.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
          >
            Salir
          </button>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[var(--pf-navy)] text-white shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <p className="font-semibold">Menú</p>
              <button type="button" className="text-sm text-slate-300" onClick={() => setMenuOpen(false)}>
                Cerrar
              </button>
            </div>
            <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
              <NavGroups onNavigate={() => setMenuOpen(false)} />
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
