import { useEffect, useRef, useState, type FormEvent } from "react"
import { saveCustomer, searchSaleCustomers, type SaleCustomer } from "../api"

/** Ventana para elegir el cliente de la venta (o crear uno nuevo al vuelo). */
export function CustomerPicker({
  canCreate,
  onPick,
  onClose,
}: {
  canCreate: boolean
  onPick: (customer: SaleCustomer | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<SaleCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: "", document: "", phone: "", creditLimit: "" })
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const handle = window.setTimeout(() => {
      searchSaleCustomers(query)
        .then((data) => {
          if (!cancelled) {
            setRows(data.customers)
            setError("")
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo buscar")
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [query])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const created = await saveCustomer({
        name: form.name.trim(),
        document: form.document.trim() || undefined,
        phone: form.phone.trim() || undefined,
        creditLimit: form.creditLimit.trim() || "0",
      })
      const found = await searchSaleCustomers(form.name.trim())
      const customer = found.customers.find((item) => item.id === created.id)
      if (customer) onPick(customer)
      else onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el cliente")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-[var(--pf-navy)]/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Elegir cliente"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-lg font-semibold text-[var(--pf-navy)]">{creating ? "Nuevo cliente" : "Cliente de la venta"}</h2>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {creating ? (
          <form onSubmit={onCreate} className="space-y-3 overflow-y-auto p-4">
            <label className="block text-sm font-medium text-slate-700">
              Nombre o razón social
              <input
                autoFocus
                required
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-medium text-slate-700">
                DNI o RUC
                <input
                  inputMode="numeric"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
                  value={form.document}
                  onChange={(event) => setForm((current) => ({ ...current, document: event.target.value }))}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Teléfono
                <input
                  inputMode="tel"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Límite de crédito (0 = sin límite)
              <input
                inputMode="decimal"
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-right"
                placeholder="0.00"
                value={form.creditLimit}
                onChange={(event) => setForm((current) => ({ ...current, creditLimit: event.target.value }))}
              />
            </label>
            {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-medium text-slate-700"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-11 flex-1 rounded-xl bg-[var(--pf-accent)] text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar y elegir"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="space-y-2 border-b border-slate-100 p-3">
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, DNI/RUC o teléfono…"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                aria-label="Buscar cliente"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onPick(null)}
                  className="h-10 flex-1 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-white"
                >
                  Público general
                </button>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(true)
                      setError("")
                      setForm((current) => ({ ...current, name: query }))
                    }}
                    className="h-10 flex-1 rounded-xl bg-[var(--pf-accent)] text-sm font-semibold text-white"
                  >
                    + Nuevo cliente
                  </button>
                ) : null}
              </div>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
              {error ? <li className="px-4 py-3 text-sm text-red-700">{error}</li> : null}
              {!loading && !error && rows.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-slate-500">
                  {query ? `Sin clientes para “${query}”.` : "Todavía no hay clientes registrados."}
                </li>
              ) : null}
              {rows.map((customer) => {
                const owes = customer.balanceCents > 0
                return (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => onPick(customer)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-500 text-xs font-bold text-white">
                        {customer.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((word) => word[0]?.toUpperCase())
                          .join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[var(--pf-navy)]">{customer.name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[customer.document, customer.phone].filter(Boolean).join(" · ") || "Sin documento"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs">
                        <span className={`block font-semibold tabular-nums ${owes ? "text-red-700" : "text-emerald-700"}`}>
                          {owes ? `Debe ${customer.balance}` : "Sin deuda"}
                        </span>
                        <span className="block text-slate-400">Límite: {customer.limit}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
