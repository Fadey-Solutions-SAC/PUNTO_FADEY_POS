import { logout } from "../api"

type Me = {
  user: { name: string; role: string; configMode: boolean }
  business: { name: string; currency: string }
}

export function HomePage({ me }: { me: Me }) {
  async function onLogout() {
    await logout().catch(() => undefined)
    window.location.assign("/login")
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--pf-accent)]">Sesión activa</p>
      <h1 className="text-3xl font-bold text-white">Hola, {me.user.name}</h1>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        <p>
          Negocio: <span className="text-white">{me.business.name}</span>
        </p>
        <p className="mt-1">
          Rol: <span className="text-white">{me.user.role}</span>
          {me.user.configMode ? " · modo configuración" : ""}
        </p>
        <p className="mt-1">Moneda: {me.business.currency}</p>
      </div>
      <p className="text-sm text-slate-400">
        Fase 2 lista: login por API. Caja, ventas e inventario se migran en las siguientes partes. En Render el POS
        completo sigue en Next.
      </p>
      <button
        type="button"
        onClick={onLogout}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-white/20 px-4 text-sm font-semibold text-white"
      >
        Cerrar sesión
      </button>
    </main>
  )
}
