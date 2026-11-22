import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { addCashMovement, enterCash, getCashStatus, openCash, type CashStatus } from "../api"

/** mode: Ingreso de caja o Egreso de caja (módulos del menú); sin mode, la caja con ambos. */
export function CashPage({ mode }: { mode?: "INCOME" | "EXPENSE" } = {}) {
  const [data, setData] = useState<CashStatus | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [type, setType] = useState<string>(mode ?? "INCOME")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")

  const reload = useCallback(async () => {
    setData(await getCashStatus())
  }, [])

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
    return (
      <div className="space-y-4">
        <div className="h-12 w-64 animate-pulse rounded-xl bg-slate-200/60" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      </div>
    )
  }

  const session = data?.session ?? null
  const isOut = (code: string) => code === "EXPENSE" || code === "WITHDRAWAL"
  const movements = (session?.movements ?? []).filter((row) => !mode || isOut(row.type) === (mode === "EXPENSE"))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "INCOME"
              ? "Dinero que entra a la caja sin ser venta (sencillo, aporte…)."
              : mode === "EXPENSE"
                ? "Dinero que sale de la caja (gastos, pagos, retiros)."
                : "Apertura, esperado y movimientos de la sesión abierta."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link to="/caja/historial" className="inline-flex h-10 items-center rounded-xl bg-indigo-500 px-3 font-semibold text-white shadow-sm hover:bg-indigo-600">
            Historial
          </Link>
          {session ? (
            <>
              <Link to="/caja/cierre" className="inline-flex h-10 items-center rounded-xl bg-rose-500 px-3 font-semibold text-white shadow-sm hover:bg-rose-600">
                Cerrar caja
              </Link>
              <Link to="/ventas" className="inline-flex h-10 items-center rounded-xl bg-[var(--pf-accent)] px-4 font-semibold text-white shadow-sm hover:brightness-110">
                Ir a vender
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!session ? (
        data ? <RegisterBoard data={data} onDone={reload} onError={setError} /> : null
      ) : (
        <>
          {!mode && data ? <RegisterBoard data={data} onDone={reload} onError={setError} compact /> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Caja</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Abierta
                </span>
              </div>
              <p className="mt-1 text-lg font-semibold text-[var(--pf-navy)]">{session.registerName}</p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-sky-700">Efectivo inicial</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-sky-700">{session.opening.label}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 p-4 text-white shadow-md">
              <p className="text-xs font-medium uppercase tracking-wide text-white/80">Efectivo esperado</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{session.expected?.label ?? "—"}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <form onSubmit={onMovement} className="h-fit space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-[var(--pf-navy)]">{mode === "INCOME" ? "Nuevo ingreso" : mode === "EXPENSE" ? "Nuevo egreso" : "Nuevo movimiento"}</h2>
              <div className={`grid grid-cols-2 gap-1.5 ${mode ? "hidden" : ""}`} role="radiogroup" aria-label="Tipo de movimiento">
                {MOVE_TYPES.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    role="radio"
                    aria-checked={type === item.code}
                    onClick={() => setType(item.code)}
                    className={`h-10 rounded-xl text-sm font-medium ring-1 transition ${
                      type === item.code
                        ? isOut(item.code)
                          ? "bg-red-600 text-white ring-red-600"
                          : "bg-emerald-600 text-white ring-emerald-600"
                        : "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300"
                    }`}
                  >
                    {isOut(item.code) ? "− " : "+ "}
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Monto
                <input
                  inputMode="decimal"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-right tabular-nums"
                  value={amount}
                  placeholder="0.00"
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Motivo
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
                  value={reason}
                  placeholder={isOut(type) ? "Ej. pago de delivery" : "Ej. sencillo adicional"}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className={`h-11 w-full rounded-xl px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60 ${
                  isOut(type) ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {pending ? "Guardando…" : isOut(type) ? "Registrar salida" : "Registrar entrada"}
              </button>
            </form>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold text-[var(--pf-navy)]">
                  {mode === "INCOME" ? "Ingresos de la sesión" : mode === "EXPENSE" ? "Egresos de la sesión" : "Movimientos de la sesión"}
                </h2>
                <span className="text-xs text-slate-500">{movements.length}</span>
              </div>
              <div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Hora</th>
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium">Motivo</th>
                      <th className="px-3 py-2 text-right font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                          Sin movimientos aún.
                        </td>
                      </tr>
                    ) : (
                      movements.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">{row.createdAtLabel}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                                isOut(row.type) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {row.typeLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2">{row.reason}</td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${isOut(row.type) ? "text-red-700" : "text-emerald-700"}`}>
                            {isOut(row.type) ? "− " : "+ "}
                            {row.amount.label}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Solo ingreso y egreso (los movimientos antiguos de depósito/retiro se siguen mostrando).
const MOVE_TYPES = [
  { code: "INCOME", label: "Ingreso" },
  { code: "EXPENSE", label: "Egreso" },
]

/**
 * Panel de cajas físicas de la sucursal: cada caja con su estado y el botón para abrirla o entrar.
 * El dueño y el administrador ven y usan todas; el cajero solo la suya. Varias personas pueden estar en la misma caja.
 */
function RegisterBoard({
  data,
  onDone,
  onError,
  compact = false,
}: {
  data: CashStatus
  onDone: () => Promise<void>
  onError: (text: string) => void
  compact?: boolean
}) {
  const [opening, setOpening] = useState<string | null>(null)
  const [amount, setAmount] = useState("0")
  const [busy, setBusy] = useState("")
  const board = data.board ?? data.registers.map((item) => ({ ...item, open: false, openedBy: null, openedAtLabel: null, accessible: true, current: false, people: [] }))

  async function act(id: string, action: () => Promise<unknown>) {
    setBusy(id)
    onError("")
    try {
      await action()
      setOpening(null)
      await onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo completar")
    } finally {
      setBusy("")
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-semibold text-[var(--pf-navy)]">{compact ? "Cajas de la sucursal" : "Elige tu caja"}</h2>
        <p className="text-xs text-slate-500">
          {data.fullAccess ? "Tienes acceso a todas las cajas." : "Trabajas en la caja que tienes asignada."} Varias personas pueden estar en la misma caja.
        </p>
      </div>
      {board.length === 0 ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">No hay cajas en esta sucursal. Créalas en Configuración → Sucursales y cajas.</p>
      ) : null}
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-3 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
        {board.map((register) => (
          <div
            key={register.id}
            className={`space-y-2 rounded-2xl border bg-white p-4 shadow-sm ${register.current ? "border-[var(--pf-accent)] ring-2 ring-[var(--pf-accent)]/20" : "border-slate-200"} ${
              register.accessible ? "" : "opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-semibold text-[var(--pf-navy)]">{register.name}</p>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  register.open ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500"
                }`}
              >
                <span className={`size-1.5 rounded-full ${register.open ? "bg-emerald-500" : "bg-slate-400"}`} />
                {register.open ? "Abierta" : "Cerrada"}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {register.open ? `Abrió ${register.openedBy ?? "—"} · ${register.openedAtLabel ?? ""}` : "Sin turno abierto"}
              {register.people.length ? ` · En la caja: ${register.people.join(", ")}` : ""}
            </p>
            {!register.accessible ? (
              <p className="text-xs font-semibold text-slate-500">Sin acceso (no es tu caja)</p>
            ) : register.current && register.open ? (
              <p className="inline-flex h-10 items-center rounded-xl bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">✓ Estás en esta caja</p>
            ) : register.open ? (
              <button
                type="button"
                disabled={busy === register.id}
                onClick={() => void act(register.id, () => enterCash(register.id))}
                className="h-10 w-full rounded-xl bg-[var(--pf-accent)] text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === register.id ? "Entrando…" : "Entrar"}
              </button>
            ) : opening === register.id ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void act(register.id, () => openCash(register.id, amount || "0"))
                }}
              >
                <label className="block text-xs font-medium text-slate-600">
                  Efectivo inicial
                  <input
                    autoFocus
                    inputMode="decimal"
                    placeholder="Ej. 100.00"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-right tabular-nums"
                    value={amount}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setOpening(null)} className="h-10 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">
                    Cancelar
                  </button>
                  <button type="submit" disabled={busy === register.id} className="h-10 flex-1 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-60">
                    {busy === register.id ? "Abriendo…" : "Abrir caja"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpening(register.id)
                  setAmount("0")
                }}
                className="h-10 w-full rounded-xl bg-emerald-600 text-sm font-semibold text-white"
              >
                Abrir
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
