import { useEffect, useMemo, useState } from "react"
import { getCustomerCredits, postCustomerAbono } from "../api"
import type { ParkedSale } from "../parked"

type Data = Awaited<ReturnType<typeof getCustomerCredits>>

function money(cents: number) {
  return `S/ ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Cuentas pendientes desde la Caja:
 * - A cuenta por nombre: ventas guardadas con un nombre (aún no registradas). «Cobrar» las carga en el carrito.
 * - Clientes registrados: ventas a crédito; el abono se reparte de la deuda más antigua a la más nueva.
 */
export function PendingAccountsDialog({
  onClose,
  parked = [],
  showCustomers = true,
  onResume,
  onDrop,
}: {
  onClose: () => void
  parked?: ParkedSale[]
  showCustomers?: boolean
  onResume?: (id: string) => void
  onDrop?: (id: string) => void
}) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState("")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("CASH")
  const [busy, setBusy] = useState(false)

  async function load() {
    const payload = await getCustomerCredits()
    setData(payload)
    setMethod((current) => (payload.methods.some((item) => item.code === current) ? current : payload.methods[0]?.code ?? "CASH"))
  }

  useEffect(() => {
    if (!showCustomers) return
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [showCustomers])

  const customers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; dueCents: number; count: number; oldest: string }>()
    for (const account of data?.accounts ?? []) {
      const row = map.get(account.customerId) ?? { id: account.customerId, name: account.customerName, dueCents: 0, count: 0, oldest: account.createdAtLabel }
      row.dueCents += account.dueCents
      row.count += 1
      map.set(account.customerId, row)
    }
    return [...map.values()].sort((a, b) => b.dueCents - a.dueCents)
  }, [data])

  const term = query.trim().toLowerCase()
  const visible = customers.filter((item) => !term || item.name.toLowerCase().includes(term))
  const visibleParked = parked.filter((item) => !term || item.label.toLowerCase().includes(term))
  const customer = customers.find((item) => item.id === selected)
  const totalDue = customers.reduce((sum, item) => sum + item.dueCents, 0) + parked.reduce((sum, item) => sum + item.totalCents, 0)
  const count = customers.length + parked.length

  async function onCharge() {
    if (!customer) return
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await postCustomerAbono({ customerId: customer.id, saleId: "", amount, method })
      setMessage(`Cobrado ${money(Math.round(Number(amount) * 100))} a ${customer.name}`)
      setSelected("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cobrar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[var(--pf-navy)]/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Cuentas pendientes"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Cuentas pendientes</h2>
            <p className="text-xs text-slate-500">
              {count} cuenta(s) · total <b className="text-red-600">{money(totalDue)}</b>
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

          <input
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
            placeholder="Buscar por nombre… Ej. Rosa"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          {/* A cuenta por nombre */}
          <section className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">A cuenta por nombre</p>
            {visibleParked.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
                Sin cuentas por nombre. Se crean en Cobrar → Poner a cuenta.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-amber-200">
                {visibleParked.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--pf-navy)]">{item.label}</span>
                      <span className="block text-xs text-slate-500">
                        {item.lines.reduce((sum, line) => sum + line.quantity, 0)} und · {item.lines.map((line) => line.name).join(", ")}
                      </span>
                    </span>
                    <span className="font-bold tabular-nums text-red-600">{money(item.totalCents)}</span>
                    <button
                      type="button"
                      onClick={() => onResume?.(item.id)}
                      className="h-9 rounded-lg bg-[var(--pf-accent)] px-3 text-xs font-semibold text-white"
                    >
                      Cobrar
                    </button>
                    <button
                      type="button"
                      aria-label={`Descartar ${item.label}`}
                      onClick={() => {
                        if (window.confirm(`¿Descartar la cuenta "${item.label}"? Sus productos no se venden.`)) onDrop?.(item.id)
                      }}
                      className="h-9 rounded-lg px-2 text-xs text-slate-400 hover:bg-red-50 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Clientes registrados (ventas a cuenta del cliente) */}
          {showCustomers ? (
            <section className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Clientes registrados</p>

              {customer ? (
                <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-sm">
                    Cobrar a <b>{customer.name}</b> · debe <b className="text-red-600">{money(customer.dueCents)}</b> ({customer.count} venta(s) a cuenta)
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Monto
                      <input
                        inputMode="decimal"
                        autoFocus
                        placeholder="Ej. 20.00"
                        className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-right font-semibold"
                        value={amount}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => setAmount(event.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Medio de pago
                      <select className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm" value={method} onChange={(event) => setMethod(event.target.value)}>
                        {(data?.methods ?? []).map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end gap-2">
                      <button type="button" disabled={busy} onClick={() => setSelected("")} className="h-11 flex-1 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600">
                        Volver
                      </button>
                      <button
                        type="button"
                        disabled={busy || !(Number(amount) > 0)}
                        onClick={() => void onCharge()}
                        className="h-11 flex-1 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {busy ? "…" : "Cobrar"}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">El cobro se aplica primero a la deuda más antigua. El efectivo entra a la caja abierta.</p>
                </div>
              ) : null}

              {!data ? <p className="text-sm text-slate-500">Cargando…</p> : null}
              {data && visible.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">Ningún cliente registrado debe.</p>
              ) : null}
              {visible.length > 0 ? (
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                  {visible.map((item) => (
                    <li key={item.id} className={`flex items-center gap-3 px-3 py-2 ${item.id === selected ? "bg-amber-50" : ""}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[var(--pf-navy)]">{item.name}</span>
                        <span className="block text-xs text-slate-500">
                          {item.count} venta(s) · desde {item.oldest}
                        </span>
                      </span>
                      <span className="font-bold tabular-nums text-red-600">{money(item.dueCents)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(item.id)
                          setAmount((item.dueCents / 100).toFixed(2))
                          setMessage("")
                        }}
                        className="h-9 rounded-lg bg-[var(--pf-accent)] px-3 text-xs font-semibold text-white"
                      >
                        Cobrar
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
