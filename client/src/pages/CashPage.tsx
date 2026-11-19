import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { addCashMovement, getCashStatus, openCash, type CashStatus } from "../api"

export function CashPage() {
  const [data, setData] = useState<CashStatus | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [registerId, setRegisterId] = useState("")
  const [openingAmount, setOpeningAmount] = useState("0")
  const [type, setType] = useState("INCOME")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")

  const reload = useCallback(async () => {
    const status = await getCashStatus()
    setData(status)
    if (!registerId && status.registers[0]) {
      setRegisterId(status.assignedRegisterId || status.registers[0].id)
    }
  }, [registerId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await reload()
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error de caja")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reload])

  async function onOpen(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await openCash(registerId, openingAmount || "0")
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir")
    } finally {
      setPending(false)
    }
  }

  async function onMovement(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await addCashMovement(type, amount, reason)
      setAmount("")
      setReason("")
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar")
    } finally {
      setPending(false)
    }
  }

  if (!data && !error) {
    return <p className="text-sm text-slate-500">Cargando caja…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Caja</h1>
          <p className="mt-1 text-sm text-slate-500">Apertura, esperado y movimientos de la sesión abierta.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/caja/cierre" className="text-sm font-medium text-[var(--pf-accent)] hover:underline">
            Cierre
          </Link>
          <Link to="/caja/historial" className="text-sm font-medium text-[var(--pf-accent)] hover:underline">
            Historial
          </Link>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!data?.session ? (
        <form onSubmit={onOpen} className="max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium text-[var(--pf-navy)]">Abrir caja</h2>
          <label className="block text-sm">
            Caja registradora
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={registerId}
              onChange={(event) => setRegisterId(event.target.value)}
            >
              {data?.registers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Monto de apertura
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={openingAmount}
              onChange={(event) => setOpeningAmount(event.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={pending || !data?.registers.length}
            className="h-11 w-full rounded-xl bg-[var(--pf-navy)] text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Abriendo…" : "Abrir caja"}
          </button>
        </form>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Caja" value={data.session.registerName} />
            <Stat label="Apertura" value={data.session.opening.label} />
            <Stat label="Esperado" value={data.session.expected?.label ?? "—"} />
          </div>

          <form onSubmit={onMovement} className="max-w-xl space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-medium text-[var(--pf-navy)]">Nuevo movimiento</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm sm:col-span-1">
                Tipo
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="INCOME">Ingreso</option>
                  <option value="EXPENSE">Egreso</option>
                  <option value="WITHDRAWAL">Retiro</option>
                  <option value="DEPOSIT">Depósito</option>
                </select>
              </label>
              <label className="block text-sm">
                Monto
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </label>
              <label className="block text-sm sm:col-span-3">
                Motivo
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)} required />
              </label>
            </div>
            <button type="submit" disabled={pending} className="h-11 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60">
              {pending ? "Guardando…" : "Registrar"}
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Hora</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Motivo</th>
                  <th className="px-3 py-2 font-medium text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.session.movements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-slate-500">
                      Sin movimientos aún.
                    </td>
                  </tr>
                ) : (
                  data.session.movements.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{row.createdAtLabel}</td>
                      <td className="px-3 py-2">{row.typeLabel}</td>
                      <td className="px-3 py-2">{row.reason}</td>
                      <td className="px-3 py-2 text-right font-medium">{row.amount.label}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--pf-navy)]">{value}</p>
    </div>
  )
}
