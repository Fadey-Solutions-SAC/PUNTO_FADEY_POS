import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { closeCash, getClosePreview, type ClosePreview } from "../api"
import { pendingCount } from "../offline"

export function CloseCashPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<ClosePreview | null>(null)
  const [denoms, setDenoms] = useState<Record<string, string>>({})
  const [cashManual, setCashManual] = useState("")
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
    for (const item of data.denoms) {
      const qty = Math.max(0, Math.floor(Number(denoms[item.key] || 0)))
      soles += qty * item.value
    }
    return Math.round(soles * 100)
  }, [data, denoms])

  const countedLabel = useMemo(() => {
    if (cashManual.trim()) return cashManual.trim()
    return (denomTotal / 100).toFixed(2)
  }, [cashManual, denomTotal])

  function setDenom(key: string, value: string) {
    const clean = value.replace(/[^\d]/g, "")
    const next = { ...denoms, [key]: clean }
    setDenoms(next)
    if (!data) return
    let soles = 0
    for (const item of data.denoms) {
      const qty = Math.max(0, Math.floor(Number(next[item.key] || 0)))
      soles += qty * item.value
    }
    setCashManual((Math.round(soles * 100) / 100).toFixed(2))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!data) return
    const queued = pendingCount()
    if (queued > 0) {
      setError(
        `Hay ${queued} venta${queued === 1 ? "" : "s"} guardada${queued === 1 ? "" : "s"} sin conexión en este equipo. Sincronízalas antes de cerrar para que entren en esta caja.`,
      )
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

  const bills = data.denoms.filter((item) => item.kind === "bill")
  const coins = data.denoms.filter((item) => item.kind === "coin")
  const expectedCents = data.expectedCash.cents
  const countedCents = Math.round(Number(countedLabel || 0) * 100)
  const diffCents = countedCents - expectedCents

  const queued = pendingCount()

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-4">
      {queued > 0 ? (
        <Link
          to="/ventas/sincronizar"
          className="block rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100"
        >
          <b>
            {queued} venta{queued === 1 ? "" : "s"} sin sincronizar.
          </b>{" "}
          El efectivo esperado todavía no las incluye. Sincroniza antes de cerrar →
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Cierre de caja</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.registerName} · esperado {data.expectedCash.label}
          </p>
        </div>
        <Link to="/caja" className="text-sm font-medium text-[var(--pf-accent)] hover:underline">
          Volver
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Apertura" value={data.opening.label} />
        <Stat label="Ingresos / egresos" value={`${data.income.label} / ${data.expense.label}`} />
        <Stat label="Esperado efectivo" value={data.expectedCash.label} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium text-[var(--pf-navy)]">Conteo rápido</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <DenomGroup title="Billetes" items={bills} denoms={denoms} onChange={setDenom} />
          <DenomGroup title="Monedas" items={coins} denoms={denoms} onChange={setDenom} />
        </div>
        <label className="mt-4 block text-sm">
          Total contado (S/)
          <input
            className="mt-1 w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2"
            value={cashManual}
            onChange={(event) => setCashManual(event.target.value)}
          />
        </label>
        <p className={`mt-2 text-sm font-medium ${diffCents === 0 ? "text-emerald-700" : "text-amber-700"}`}>
          Diferencia: {(diffCents / 100).toFixed(2)} {data.currency}
        </p>
      </section>

      {data.posRows.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium text-[var(--pf-navy)]">Otros medios (esperado)</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {data.posRows.map((row) => (
              <li key={row.code} className="flex justify-between gap-2">
                <span>{row.label}</span>
                <span className="font-medium">{row.expected.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <label className="block text-sm">
        Notas
        <textarea
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-[var(--pf-navy)] px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Cerrando…" : "Confirmar cierre"}
      </button>
    </form>
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

function DenomGroup({
  title,
  items,
  denoms,
  onChange,
}: {
  title: string
  items: { key: string; label: string }[]
  denoms: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <label key={item.key} className="flex items-center justify-between gap-2 text-sm">
            <span>{item.label}</span>
            <input
              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right"
              inputMode="numeric"
              value={denoms[item.key] ?? ""}
              onChange={(event) => onChange(item.key, event.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
