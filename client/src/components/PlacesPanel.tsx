import { useState, type FormEvent } from "react"
import {
  createRegisterApi,
  createSettingsBranch,
  createWarehouseApi,
  deleteRegisterApi,
  deleteWarehouseApi,
  getSettings,
  switchPlace,
} from "../api"

type Branch = Awaited<ReturnType<typeof getSettings>>["branches"][number]

/** Sucursales con sus almacenes y cajas; cambiar el lugar de trabajo. */
export function PlacesPanel({ branches, onChanged }: { branches: Branch[]; onChanged: () => Promise<void> }) {
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [branchName, setBranchName] = useState("")
  const [warehouseName, setWarehouseName] = useState("")
  const [registerName, setRegisterName] = useState("")

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await action()
      await onChanged()
      setMessage(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(false)
    }
  }

  async function onSwitch(branch: Branch, warehouseId: string) {
    setBusy(true)
    setError("")
    try {
      const result = await switchPlace(branch.id, warehouseId)
      setMessage(`Ahora trabajas en ${result.branchName} · ${result.warehouseName}. Recargando…`)
      // El menú, la caja y el stock dependen del lugar: se recarga la app.
      window.setTimeout(() => window.location.assign("/"), 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar")
      setBusy(false)
    }
  }

  function submit(event: FormEvent, action: () => Promise<unknown>, ok: string, reset: () => void) {
    event.preventDefault()
    void run(async () => {
      await action()
      reset()
    }, ok)
  }

  const current = branches.find((branch) => branch.current)

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {branches.map((branch) => (
          <div key={branch.id} className={`rounded-2xl border p-3 ${branch.current ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-[var(--pf-navy)]">{branch.name}</p>
              {branch.current ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">Sucursal actual</span> : null}
            </div>

            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Almacenes</p>
            <ul className="mt-1 space-y-1">
              {(branch.warehouseList ?? []).map((warehouse) => (
                <li key={warehouse.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm ring-1 ring-slate-100">
                  <span className="min-w-0 flex-1 truncate">
                    {warehouse.name}
                    {warehouse.isDefault ? <span className="ml-1 text-xs text-slate-400">(principal)</span> : null}
                  </span>
                  {warehouse.current ? (
                    <span className="text-xs font-semibold text-amber-700">Trabajando aquí</span>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void onSwitch(branch, warehouse.id)} className="rounded-md px-2 py-0.5 text-xs font-semibold text-[var(--pf-accent)] hover:bg-slate-100">
                      Trabajar aquí
                    </button>
                  )}
                  {branch.current && !warehouse.current && !warehouse.isDefault ? (
                    <button
                      type="button"
                      aria-label={`Eliminar almacén ${warehouse.name}`}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`¿Eliminar el almacén ${warehouse.name}? Solo se puede si nunca tuvo movimientos.`))
                          void run(() => deleteWarehouseApi(warehouse.id), "Almacén eliminado")
                      }}
                      className="rounded-md px-1.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-700"
                    >
                      ✕
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Cajas</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(branch.registerList ?? []).map((register) => (
                <span key={register.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium ring-1 ring-slate-200">
                  {register.name}
                  {branch.current ? (
                    <button
                      type="button"
                      aria-label={`Quitar ${register.name}`}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`¿Quitar ${register.name}? Si tiene historial, solo se desactiva.`)) void run(() => deleteRegisterApi(register.id), "Caja quitada")
                      }}
                      className="text-slate-400 hover:text-red-700"
                    >
                      ✕
                    </button>
                  ) : null}
                </span>
              ))}
              {(branch.registerList ?? []).length === 0 ? <span className="text-xs text-slate-400">Sin cajas</span> : null}
            </div>
          </div>
        ))}
      </div>

      {current ? (
        <div className="grid gap-3 md:grid-cols-2">
          <form
            onSubmit={(event) => submit(event, () => createWarehouseApi(warehouseName), "Almacén creado", () => setWarehouseName(""))}
            className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-3"
          >
            <input required className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm" placeholder={`Nuevo almacén en ${current.name}`} value={warehouseName} onChange={(e) => setWarehouseName(e.target.value)} />
            <button type="submit" disabled={busy} className="h-10 rounded-xl bg-amber-500 px-3 text-sm font-semibold text-white disabled:opacity-60">
              Agregar
            </button>
          </form>
          <form
            onSubmit={(event) => submit(event, () => createRegisterApi(registerName), "Caja creada", () => setRegisterName(""))}
            className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-3"
          >
            <input required className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm" placeholder={`Nueva caja en ${current.name}`} value={registerName} onChange={(e) => setRegisterName(e.target.value)} />
            <button type="submit" disabled={busy} className="h-10 rounded-xl bg-amber-500 px-3 text-sm font-semibold text-white disabled:opacity-60">
              Agregar
            </button>
          </form>
        </div>
      ) : null}

      <form
        onSubmit={(event) => submit(event, () => createSettingsBranch(branchName), "Sucursal creada con su almacén principal y Caja 1", () => setBranchName(""))}
        className="flex gap-2 rounded-2xl border border-dashed border-slate-300 p-3"
      >
        <input required className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Nueva sucursal (se crea con almacén y caja)" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
        <button type="submit" disabled={busy} className="h-10 rounded-xl bg-slate-800 px-3 text-sm font-semibold text-white disabled:opacity-60">
          Crear sucursal
        </button>
      </form>
      <p className="text-xs text-slate-500">Los almacenes y cajas nuevos se crean en la sucursal actual. Para agregarlos en otra, primero cambia a esa sucursal.</p>
    </div>
  )
}
