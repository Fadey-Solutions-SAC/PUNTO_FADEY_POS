import { useEffect, useState, type FormEvent } from "react"
import { createCatalogUnit, getCatalogUnits } from "../api"

/** embedded: dentro de Configuración (sin título de página). */
export function UnitsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCatalogUnits>> | null>(null)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  const [symbol, setSymbol] = useState("")
  const [dimension, setDimension] = useState("UNIT")
  const [pending, setPending] = useState(false)

  async function reload() {
    setData(await getCatalogUnits())
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await createCatalogUnit({ name, symbol, dimension })
      setName("")
      setSymbol("")
      setDimension("UNIT")
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setPending(false)
    }
  }

  if (!data && !error) return <p className="text-sm text-slate-500">Cargando unidades…</p>

  return (
    <div className="space-y-4">
      <div className={embedded ? "hidden" : ""}>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Unidades</h1>
        <p className="mt-1 text-sm text-slate-500">
          Conversiones de peso, longitud o volumen. Las cajas se definen como presentación.
        </p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {data?.writable ? (
        <form onSubmit={onCreate} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
          <input
            required
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            required
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Símbolo"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
          />
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={dimension}
            onChange={(event) => setDimension(event.target.value)}
          >
            <option value="UNIT">Unidad</option>
            <option value="WEIGHT">Peso</option>
            <option value="LENGTH">Longitud</option>
            <option value="VOLUME">Volumen</option>
          </select>
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Agregar"}
          </button>
        </form>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Símbolo</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {(data?.units ?? []).map((unit) => (
              <tr key={unit.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{unit.name}</td>
                <td className="px-3 py-2">{unit.symbol}</td>
                <td className="px-3 py-2">{unit.dimensionLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(data?.conversions.length ?? 0) > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Desde</th>
                <th className="px-3 py-2 font-medium">Hacia</th>
                <th className="px-3 py-2 font-medium">Factor</th>
              </tr>
            </thead>
            <tbody>
              {data!.conversions.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.from}</td>
                  <td className="px-3 py-2">{row.to}</td>
                  <td className="px-3 py-2">{row.factor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
