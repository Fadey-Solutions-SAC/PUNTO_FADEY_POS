import { useEffect, useState, type FormEvent } from "react"
import {
  createSettingsBranch,
  createSettingsPaymentMethod,
  deleteSettingsPaymentMethod,
  getSettings,
  saveSettingsBusiness,
  saveSettingsHardwareReader,
} from "../api"

export function SettingsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getSettings>> | null>(null)
  const [business, setBusiness] = useState({
    name: "",
    legalName: "",
    taxId: "",
    currency: "PEN",
    discountLimitPct: "10",
    allowCredit: false,
  })
  const [branchName, setBranchName] = useState("")
  const [methodLabel, setMethodLabel] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)

  async function reload() {
    const payload = await getSettings()
    setData(payload)
    setBusiness(payload.business)
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function run(action: () => Promise<unknown>, ok = "Guardado") {
    setPending(true)
    setError("")
    setMessage("")
    try {
      await action()
      await reload()
      setMessage(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
    } finally {
      setPending(false)
    }
  }

  async function onBusiness(event: FormEvent) {
    event.preventDefault()
    await run(() => saveSettingsBusiness(business))
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Configuración</h1>
        <p className="mt-1 text-sm text-slate-500">
          Datos del negocio activo · {data?.versionLabel ?? "…"}. Logo, portada y usuarios avanzados siguen en Next.
        </p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      <form onSubmit={onBusiness} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <h2 className="font-medium text-[var(--pf-navy)] sm:col-span-2">Negocio</h2>
        {(
          [
            ["name", "Nombre"],
            ["legalName", "Razón social"],
            ["taxId", "Documento"],
            ["currency", "Moneda"],
            ["discountLimitPct", "Tope descuento %"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            {label}
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={business[key]}
              onChange={(event) => setBusiness((current) => ({ ...current, [key]: event.target.value }))}
              required={key === "name" || key === "currency"}
            />
          </label>
        ))}
        <label className="mt-6 flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={business.allowCredit}
            onChange={(event) => setBusiness((current) => ({ ...current, allowCredit: event.target.checked }))}
          />
          Permitir ventas a crédito
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-fit"
        >
          Guardar negocio
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium text-[var(--pf-navy)]">Métodos de pago</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(data?.paymentMethods ?? []).map((method) => (
            <li key={method.id} className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <span>
                {method.label} <span className="text-slate-400">({method.code})</span>
              </span>
              {!method.locked ? (
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  disabled={pending}
                  onClick={() => run(() => deleteSettingsPaymentMethod(method.id), "Método eliminado")}
                >
                  Eliminar
                </button>
              ) : (
                <span className="text-xs text-slate-400">Fijo</span>
              )}
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            run(async () => {
              await createSettingsPaymentMethod(methodLabel)
              setMethodLabel("")
            }, "Método creado")
          }}
        >
          <input
            className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Nuevo método"
            value={methodLabel}
            onChange={(event) => setMethodLabel(event.target.value)}
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-xl bg-[var(--pf-navy)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Agregar
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium text-[var(--pf-navy)]">Sucursales</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {(data?.branches ?? []).map((branch) => (
            <li key={branch.id}>
              {branch.name} · {branch.warehouses} almacenes · {branch.registers} cajas
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            run(async () => {
              await createSettingsBranch(branchName)
              setBranchName("")
            }, "Sucursal creada")
          }}
        >
          <input
            className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Nueva sucursal"
            value={branchName}
            onChange={(event) => setBranchName(event.target.value)}
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-xl bg-[var(--pf-navy)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Crear
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium text-[var(--pf-navy)]">Lector de código</h2>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(data?.hardwareReader)}
            disabled={pending}
            onChange={(event) => run(() => saveSettingsHardwareReader(event.target.checked))}
          />
          Usar lector de hardware continuo
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium text-[var(--pf-navy)]">Versión</h2>
        <p className="mt-2 text-sm text-slate-600">{data?.versionLabel}</p>
        <p className="mt-1 text-xs text-slate-400">Usuarios: {(data?.users ?? []).length}</p>
      </div>
    </div>
  )
}
