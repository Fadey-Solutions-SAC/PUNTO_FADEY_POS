import { useState, type FormEvent } from "react"
import { wipeAllData } from "../api"

/** Zona de peligro: vacía todo el sistema. Pide la contraseña de configuración y una confirmación. */
export function WipeDataPanel() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!confirm) return
    if (!window.confirm("Se borrarán TODOS los datos: productos, ventas, caja, clientes, usuarios y configuración. No se puede deshacer. ¿Continuar?")) return
    setBusy(true)
    setError("")
    try {
      await wipeAllData(password)
      // Lo guardado en este equipo (ventas en cola, ventas en espera, catálogo sin conexión) también se limpia.
      for (const key of ["pf-offline-sales-v1", "pf-offline-products-v1", "pf-offline-synced-v1", "pf-parked-sales-v1"]) {
        try {
          localStorage.removeItem(key)
        } catch {
          /* sin almacenamiento */
        }
      }
      window.location.href = "/login"
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-red-200 bg-red-50/50 p-4">
      <h3 className="font-semibold text-red-700">Borrar todos los datos</h3>
      <p className="text-sm text-slate-600">
        Vacía el sistema por completo para empezar de cero. Pide la <b>contraseña de configuración</b> (no la de tu usuario). Descarga una copia antes si vas a
        necesitar estos datos.
      </p>
      <label className="block max-w-sm text-sm font-medium text-slate-700">
        Contraseña de configuración
        <input
          type="password"
          required
          autoComplete="off"
          className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="size-4" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />
        Entiendo que se borrarán todos los datos y no se puede deshacer
      </label>
      {error ? <p className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button type="submit" disabled={busy || !confirm || !password} className="h-11 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Borrando…" : "Borrar todos los datos"}
      </button>
    </form>
  )
}
