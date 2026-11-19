import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getCustomerHistory } from "../api"

export function CustomerHistoryPage() {
  const [customerId, setCustomerId] = useState("")
  const [data, setData] = useState<Awaited<ReturnType<typeof getCustomerHistory>> | null>(null)
  const [error, setError] = useState("")

  async function load(cliente?: string) {
    const payload = await getCustomerHistory(cliente || undefined)
    setData(payload)
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Historial de clientes</h1>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          load(customerId).catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
        }}
      >
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="">Todos</option>
          {(data?.customers ?? []).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white">
          Ver
        </button>
      </form>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(data?.sales ?? []).map((sale) => (
              <tr key={sale.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{sale.createdAtLabel}</td>
                <td className="px-3 py-2">{sale.customerName}</td>
                <td className="px-3 py-2">{sale.typeLabel}</td>
                <td className="px-3 py-2 text-right font-medium">{sale.total}</td>
                <td className="px-3 py-2 text-right">
                  <Link to={`/ventas/${sale.id}`} className="text-[var(--pf-accent)] hover:underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
