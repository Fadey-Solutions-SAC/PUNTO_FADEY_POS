import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Search } from "lucide-react"
import { getCustomers, saveCustomer } from "../api"
import { DocumentLookup } from "../components/DocumentLookup"

type Customer = Awaited<ReturnType<typeof getCustomers>>["customers"][number]

const emptyForm = {
  name: "",
  document: "",
  phone: "",
  email: "",
  address: "",
  creditLimit: "0",
}

export function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([])
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [pending, setPending] = useState(false)

  async function reload() {
    const data = await getCustomers()
    setRows(data.customers)
  }

  useEffect(() => {
    let cancelled = false
    reload()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return rows
    return rows.filter((row) =>
      [row.name, row.document, row.phone, row.email].some((value) => value.toLowerCase().includes(text)),
    )
  }, [query, rows])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await saveCustomer(form)
      setOpen(false)
      setForm(emptyForm)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-slate-500">Registro de clientes del negocio.</p>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:ring-2 focus-within:ring-[var(--pf-accent)]/20">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder="Buscar cliente por nombre o documento…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setForm(emptyForm)
            setOpen(true)
          }}
          className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white"
        >
          Nuevo cliente
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Documento</th>
              <th className="px-3 py-2 font-medium">Teléfono</th>
              <th className="px-3 py-2 font-medium">Correo</th>
              <th className="px-3 py-2 font-medium text-right">Deuda</th>
              <th className="px-3 py-2 font-medium text-right">Límite</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((customer) => (
              <tr key={customer.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-[var(--pf-navy)]">{customer.name}</td>
                <td className="px-3 py-2">{customer.document || "—"}</td>
                <td className="px-3 py-2">{customer.phone || "—"}</td>
                <td className="px-3 py-2">{customer.email || "—"}</td>
                <td className="px-3 py-2 text-right">{customer.debt}</td>
                <td className="px-3 py-2 text-right">{customer.limit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="px-3 py-6 text-center text-sm text-slate-500">Sin clientes.</p> : null}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false)
          }}
        >
          <form onSubmit={onSubmit} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-[var(--pf-navy)]">Nuevo cliente</h2>
              <button type="button" disabled={pending} className="text-sm text-slate-500" onClick={() => setOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["name", "Nombre", true],
                  ["document", "Documento", false],
                  ["phone", "Teléfono", false],
                  ["email", "Correo", false],
                  ["address", "Dirección", false],
                  ["creditLimit", "Límite de crédito", false],
                ] as const
              ).map(([key, label, required]) => (
                <label key={key} className="block text-sm">
                  {label}
                  <span className="flex gap-2">
                    <input
                      required={required}
                      type={key === "email" ? "email" : "text"}
                      inputMode={key === "document" ? "numeric" : undefined}
                      className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2"
                      value={form[key]}
                      placeholder={
                        {
                          name: "Ej. Juan Pérez",
                          document: "Ej. 45678912 (DNI) o 20601234567 (RUC)",
                          phone: "Ej. 987 654 321",
                          email: "Ej. cliente@correo.com",
                          address: "Ej. Av. Perú 123, San Martín de Porres",
                          creditLimit: "Ej. 200.00",
                        }[key]
                      }
                      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    />
                    {key === "document" ? (
                      <DocumentLookup
                        value={form.document}
                        onFound={(party) => setForm((current) => ({ ...current, document: party.document, name: party.name, address: party.address || current.address }))}
                      />
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="submit"
              disabled={pending}
              className="mt-4 h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Guardar cliente"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
