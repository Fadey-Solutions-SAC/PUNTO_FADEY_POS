import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { getCustomerCredits, postCustomerAbono } from "../api"

export function CreditsPage() {
  const [params, setParams] = useSearchParams()
  const selected = params.get("cuenta") ?? ""
  const [data, setData] = useState<Awaited<ReturnType<typeof getCustomerCredits>> | null>(null)
  const [error, setError] = useState("")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("CASH")
  const [pending, setPending] = useState(false)

  async function reload() {
    const payload = await getCustomerCredits()
    setData(payload)
    const account = payload.accounts.find((item) => item.saleId === selected)
    if (account) {
      setAmount((account.dueCents / 100).toFixed(2))
      setMethod(payload.methods[0]?.code ?? "CASH")
    }
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  useEffect(() => {
    if (!data) return
    const account = data.accounts.find((item) => item.saleId === selected)
    if (account) setAmount((account.dueCents / 100).toFixed(2))
  }, [data, selected])

  const account = data?.accounts.find((item) => item.saleId === selected)

  async function onCharge() {
    if (!account) return
    setPending(true)
    setError("")
    try {
      await postCustomerAbono({
        customerId: account.customerId,
        saleId: account.saleId,
        amount,
        method,
      })
      setParams({})
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cobrar")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-slate-500">Solo el efectivo entra a la caja abierta.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {account ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">
            Cobrar {account.customerName} · saldo {account.due}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Monto
              <input
                placeholder="Ej. 20.00"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              Método
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                {(data?.methods ?? []).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onCharge}
              className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Cobrando…" : "Registrar cobro"}
            </button>
            <button type="button" disabled={pending} onClick={() => setParams({})} className="h-10 rounded-xl px-4 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium text-right">Saldo</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(data?.accounts ?? []).map((row) => (
              <tr key={row.saleId} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.createdAtLabel}</td>
                <td className="px-3 py-2">{row.customerName}</td>
                <td className="px-3 py-2 text-right font-medium">{row.due}</td>
                <td className="px-3 py-2 space-x-3 text-right">
                  <Link to={`/ventas/${row.saleId}`} className="text-[var(--pf-accent)] hover:underline">
                    Ver
                  </Link>
                  <button
                    type="button"
                    className="text-[var(--pf-navy)] hover:underline"
                    onClick={() => setParams({ cuenta: row.saleId })}
                  >
                    Cobrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.accounts.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">Sin saldos pendientes.</p>
        ) : null}
      </div>
    </div>
  )
}
