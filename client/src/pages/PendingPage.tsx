import { Link, useLocation } from "react-router-dom"

export function PendingPage() {
  const location = useLocation()
  const original = location.pathname.replace(/^\/pendiente/, "") || "/"
  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <h1 className="text-lg font-semibold">Módulo aún en Next</h1>
      <p className="text-sm">
        <code className="rounded bg-white/70 px-1">{original}</code> se migrará en una fase siguiente. En producción Render
        sigue sirviendo el POS completo con Next.
      </p>
      <Link to="/caja" className="inline-flex text-sm font-medium text-[var(--pf-accent)] hover:underline">
        Ir a caja (ya en Vite)
      </Link>
    </div>
  )
}
