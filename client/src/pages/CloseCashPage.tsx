import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Banknote, CheckCircle2, CircleAlert, Coins, CreditCard, Receipt, RotateCcw, Ban, Wallet } from "lucide-react"
import { closeCash, getClosePreview, type ClosePreview } from "../api"
import { pendingCount } from "../offline"

function fmt(cents: number, currency: string) {
  return `${currency === "USD" ? "$" : "S/"} ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toCents(text: string) {
  const value = Number(String(text).replace(",", "."))
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

/**
 * Arqueo y cierre de caja: efectivo por billetes y monedas, confirmación de cada otro medio
 * (Yape, tarjeta, transferencia…) contra lo esperado, y resumen del turno.
 */
export function CloseCashPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<ClosePreview | null>(null)
  const [denoms, setDenoms] = useState<Record<string, string>>({})
  const [cashManual, setCashManual] = useState("")
  const [methodCounts, setMethodCounts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    getClosePreview()
      .then((preview) => {
        if (cancelled) return
        setData(preview)
        setDenoms(Object.fromEntries(preview.denoms.map((item) => [item.key, ""])))
        setMethodCounts(Object.fromEntries(preview.posRows.map((row) => [row.code, ""])))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const denomTotal = useMemo(() => {
    if (!data) return 0
    let soles = 0
    for (const item of data.denoms) soles += Math.max(0, Math.floor(Number(denoms[item.key] || 0))) * item.value
    return Math.round(soles * 100)
  }, [data, denoms])

  const countedLabel = cashManual.trim() || (denomTotal / 100).toFixed(2)

  // Conteo rápido: empieza en S/ 200 y, al escribir la cantidad, pasa solo a la siguiente (de mayor a menor).
  const advanceTimer = useRef<number | undefined>(undefined)
  function focusDenom(index: number) {
    const next = document.querySelector<HTMLInputElement>(`[data-denom-index="${index}"]`)
    if (next) {
      next.focus()
      next.select()
    }
  }
  function advanceFrom(index: number, delay: number) {
    window.clearTimeout(advanceTimer.current)
    advanceTimer.current = window.setTimeout(() => focusDenom(index + 1), delay)
  }
  useEffect(() => {
    if (!data) return
    const id = window.setTimeout(() => focusDenom(0), 50)
    return () => window.clearTimeout(id)
  }, [data ? "ok" : ""])
  useEffect(() => () => window.clearTimeout(advanceTimer.current), [])

  function setDenom(key: string, value: string) {
    const clean = value.replace(/[^\d]/g, "")
    const index = data ? data.denoms.findIndex((item) => item.key === key) : -1
    // Pasa a la siguiente denominación poco después de escribir (da tiempo a números de 2 cifras).
    if (clean && index >= 0) advanceFrom(index, 700)
    const next = { ...denoms, [key]: clean }
    setDenoms(next)
    if (!data) return
    let soles = 0
    for (const item of data.denoms) soles += Math.max(0, Math.floor(Number(next[item.key] || 0))) * item.value
    setCashManual((Math.round(soles * 100) / 100).toFixed(2))
  }

  const unconfirmed = data ? data.posRows.filter((row) => methodCounts[row.code]?.trim() === "") : []

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!data) return
    const queued = pendingCount()
    if (queued > 0) {
      setError(`Hay ${queued} venta(s) guardada(s) sin conexión en este equipo. Sincronízalas antes de cerrar para que entren en esta caja.`)
      return
    }
    if (unconfirmed.length) {
      setError(`Confirma lo recibido en: ${unconfirmed.map((row) => row.label).join(", ")}.`)
      return
    }
    setPending(true)
    setError("")
    try {
      const detailLines = data.denoms
        .map((item) => {
          const qty = Number(denoms[item.key] || 0)
          return qty > 0 ? `${item.label} x ${qty}` : null
        })
        .filter(Boolean)
      await closeCash({
        counted: countedLabel,
        notes,
        arqueoDetail: detailLines.length ? `Arqueo: ${detailLines.join(", ")}` : undefined,
        denominations: denoms,
        methodCounts,
      })
      navigate("/caja", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar")
    } finally {
      setPending(false)
    }
  }

  if (!data && !error) return <p className="text-sm text-slate-500">Cargando cierre…</p>
  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        <Link to="/caja" className="text-sm text-[var(--pf-accent)] hover:underline">
          Volver a caja
        </Link>
      </div>
    )
  }
  if (!data) return null

  const currency = data.currency
  const bills = data.denoms.filter((item) => item.kind === "bill")
  const coins = data.denoms.filter((item) => item.kind === "coin")
  const expectedCents = data.expectedCash.cents
  const countedCents = toCents(countedLabel)
  const diffCents = countedCents - expectedCents
  const otherExpected = data.posRows.reduce((sum, row) => sum + row.expected.cents, 0)
  const otherConfirmed = data.posRows.reduce((sum, row) => sum + toCents(methodCounts[row.code] ?? ""), 0)
  const queued = pendingCount()
  const shift = data.shift

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {queued > 0 ? (
        <Link to="/ventas/sincronizar" className="block rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100">
          <b>{queued} venta(s) sin sincronizar.</b> El efectivo esperado todavía no las incluye. Sincroniza antes de cerrar →
        </Link>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-gradient-to-br from-[var(--pf-navy)] to-slate-700 p-4 text-white shadow-md">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">Arqueo y cierre de caja</p>
          <h1 className="text-2xl font-bold">{data.registerName}</h1>
          <p className="text-sm text-white/75">
            {data.userName ? `${data.userName} · ` : ""}abierta {data.openedAtLabel ?? ""} · apertura {data.opening.label}
          </p>
        </div>
        <Link to="/caja" className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">
          Volver
        </Link>
      </div>

      {/* Resumen del turno */}
      {shift ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Tile icon={<Receipt size={16} />} color="#0d9488" label={`Ventas (${shift.salesCount})`} value={shift.salesTotal.label} />
          <Tile icon={<Wallet size={16} />} color="#f59e0b" label="A crédito" value={shift.creditTotal.label} />
          <Tile icon={<Ban size={16} />} color="#dc2626" label={`Anuladas (${shift.voidedCount})`} value={shift.voidedTotal.label} />
          <Tile icon={<RotateCcw size={16} />} color="#8b5cf6" label={`Devoluciones (${shift.returnsCount})`} value={shift.returnsTotal.label} />
          <Tile icon={<Coins size={16} />} color="#0ea5e9" label="Ingresos / egresos" value={`${data.income.label} / ${data.expense.label}`} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Efectivo */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--pf-navy)]">
            <Banknote size={18} className="text-emerald-600" /> Efectivo en caja
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <DenomGroup title="Billetes" items={bills} denoms={denoms} onChange={setDenom} indexOf={(key) => data.denoms.findIndex((item) => item.key === key)} onEnter={(index) => advanceFrom(index, 0)} />
            <DenomGroup title="Monedas" items={coins} denoms={denoms} onChange={setDenom} indexOf={(key) => data.denoms.findIndex((item) => item.key === key)} onEnter={(index) => advanceFrom(index, 0)} />
          </div>
          <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Esperado</p>
              <p className="text-lg font-bold tabular-nums text-[var(--pf-navy)]">{data.expectedCash.label}</p>
              <p className="text-[11px] text-slate-400">apertura + ventas en efectivo + ingresos − egresos</p>
            </div>
            <label className="block">
              <span className="text-xs text-slate-500">Contado</span>
              <input
                inputMode="decimal"
                className="mt-0.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-right text-lg font-bold tabular-nums"
                value={cashManual}
                placeholder={(denomTotal / 100).toFixed(2)}
                onChange={(event) => setCashManual(event.target.value)}
              />
            </label>
            <DiffBox cents={diffCents} currency={currency} />
          </div>
        </section>

        {/* Otros medios: confirmar cada uno */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--pf-navy)]">
            <CreditCard size={18} className="text-indigo-600" /> Otros medios de pago
          </h2>
          {data.posRows.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">En este turno solo hubo efectivo.</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">Revisa tu app, voucher o banco y confirma cuánto entró por cada medio.</p>
              <ul className="space-y-2">
                {data.posRows.map((row) => {
                  const value = methodCounts[row.code] ?? ""
                  const confirmed = value.trim() !== ""
                  const diff = toCents(value) - row.expected.cents
                  return (
                    <li key={row.code} className={`rounded-xl border p-2.5 ${confirmed ? (diff === 0 ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50") : "border-slate-200"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--pf-navy)]">{row.label}</span>
                        <span className="text-xs text-slate-500">
                          esperado <b className="tabular-nums text-slate-700">{row.expected.label}</b>
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          inputMode="decimal"
                          aria-label={`Confirmado en ${row.label}`}
                          className="h-10 w-32 rounded-lg border border-slate-300 bg-white px-2 text-right font-semibold tabular-nums"
                          placeholder="Confirmado"
                          value={value}
                          onChange={(event) => setMethodCounts((current) => ({ ...current, [row.code]: event.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => setMethodCounts((current) => ({ ...current, [row.code]: row.expected.amount }))}
                          className="h-10 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"
                        >
                          Cuadra
                        </button>
                        <span className="ml-auto text-sm font-semibold tabular-nums">
                          {!confirmed ? (
                            <span className="text-slate-400">Sin confirmar</span>
                          ) : diff === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 size={15} /> Cuadra
                            </span>
                          ) : (
                            <span className={diff < 0 ? "text-red-600" : "text-sky-700"}>
                              {diff > 0 ? "+" : ""}
                              {fmt(diff, currency)}
                            </span>
                          )}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="text-right text-xs text-slate-500">
                Confirmado {fmt(otherConfirmed, currency)} de {fmt(otherExpected, currency)}
              </p>
            </>
          )}
        </section>
      </div>

      {shift && shift.movements.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-[var(--pf-navy)]">Movimientos del turno</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {shift.movements.map((movement) => (
              <li key={movement.id} className="flex items-center gap-3 py-1.5">
                <span className="w-32 shrink-0 text-xs text-slate-500">{movement.atLabel}</span>
                <span className="w-24 shrink-0 font-medium">{movement.typeLabel}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600">{movement.reason}</span>
                <span className={`font-semibold tabular-nums ${movement.out ? "text-red-600" : "text-emerald-700"}`}>
                  {movement.out ? "−" : "+"}
                  {movement.amount.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shift ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--pf-navy)]">Productos vendidos en el turno</h2>
            <span className="text-xs text-slate-500">{shift.products?.length ?? 0} producto(s)</span>
          </div>
          {shift.products?.length ? (
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1.5 font-semibold">Producto</th>
                  <th className="py-1.5 text-right font-semibold">Cantidad</th>
                  <th className="py-1.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shift.products.map((row) => (
                  <tr key={row.name}>
                    <td className="py-1.5 font-medium text-slate-800">{row.name}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">{row.quantityLabel}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{row.total.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Todavía no hay ventas en este turno.</p>
          )}
        </section>
      ) : null}

      <label className="block text-sm font-medium text-slate-700">
        Notas del cierre
        <textarea
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Ej. se retiró S/ 200 para el banco, faltó un sol en monedas…"
        />
      </label>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="sticky bottom-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <p className="text-sm text-slate-600">
          Efectivo: <b className={diffCents === 0 ? "text-emerald-700" : diffCents < 0 ? "text-red-600" : "text-sky-700"}>{diffCents === 0 ? "cuadra" : fmt(diffCents, currency)}</b>
          {data.posRows.length ? (
            <>
              {" "}
              · Otros medios: <b className={unconfirmed.length ? "text-amber-700" : "text-emerald-700"}>{unconfirmed.length ? `${unconfirmed.length} sin confirmar` : "confirmados"}</b>
            </>
          ) : null}
        </p>
        <button type="submit" disabled={pending} className="h-12 rounded-xl bg-[var(--pf-navy)] px-6 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Cerrando…" : "Confirmar cierre"}
        </button>
      </div>
    </form>
  )
}

function Tile({ icon, color, label, value }: { icon: ReactNode; color: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" style={{ borderTop: `3px solid ${color}` }}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <span style={{ color }}>{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-base font-bold tabular-nums text-[var(--pf-navy)]">{value}</p>
    </div>
  )
}

function DiffBox({ cents, currency }: { cents: number; currency: string }) {
  const ok = cents === 0
  return (
    <div className={`rounded-lg px-2 py-1 ${ok ? "bg-emerald-100" : cents < 0 ? "bg-red-100" : "bg-sky-100"}`}>
      <p className="text-xs text-slate-600">{ok ? "Diferencia" : cents < 0 ? "Faltante" : "Sobrante"}</p>
      <p className={`flex items-center gap-1 text-lg font-bold tabular-nums ${ok ? "text-emerald-700" : cents < 0 ? "text-red-700" : "text-sky-700"}`}>
        {ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
        {ok ? "Cuadra" : `${cents > 0 ? "+" : ""}${fmt(cents, currency)}`}
      </p>
    </div>
  )
}

function DenomGroup({
  title,
  items,
  denoms,
  onChange,
  indexOf,
  onEnter,
}: {
  title: string
  items: { key: string; label: string; value: number }[]
  denoms: Record<string, string>
  onChange: (key: string, value: string) => void
  indexOf: (key: string) => number
  onEnter: (index: number) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-1.5">
        {items.map((item) => {
          const qty = Math.max(0, Math.floor(Number(denoms[item.key] || 0)))
          return (
            <label key={item.key} className="grid grid-cols-[1fr_4.5rem_5rem] items-center gap-2 text-sm">
              <span className="font-medium">{item.label}</span>
              <input
                className="h-9 rounded-lg border border-slate-200 px-2 text-right tabular-nums"
                inputMode="numeric"
                placeholder="0"
                data-denom-index={indexOf(item.key)}
                value={denoms[item.key] ?? ""}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  onEnter(indexOf(item.key))
                }}
                onChange={(event) => onChange(item.key, event.target.value)}
              />
              <span className="text-right text-xs tabular-nums text-slate-500">{qty ? (qty * item.value).toFixed(2) : "—"}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
