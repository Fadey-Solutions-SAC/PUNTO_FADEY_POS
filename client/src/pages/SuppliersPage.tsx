import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { ChevronDown, FileSpreadsheet, Plus } from "lucide-react"
import { getSuppliers, saveSupplier } from "../api"
import { DocumentLookup } from "../components/DocumentLookup"
import { DataGrid, downloadGrid, filterInput, type GridColumn } from "../components/DataGrid"

const empty = {
  tradeName: "",
  legalName: "",
  taxId: "",
  contact: "",
  phone: "",
  email: "",
  address: "",
  paymentTerm: "CONTADO",
  creditDays: "",
}

type Row = Awaited<ReturnType<typeof getSuppliers>>["suppliers"][number]

const input = "mt-1 h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-sm"

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
      {hint ? <span className="mt-0.5 block text-xs font-normal text-slate-400">{hint}</span> : null}
    </label>
  )
}

export function SuppliersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [form, setForm] = useState(empty)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)
  const [query, setQuery] = useState("")

  async function reload() {
    setRows((await getSuppliers()).suppliers)
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  const set = (key: keyof typeof empty) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    setMessage("")
    try {
      await saveSupplier(form)
      setMessage(`Proveedor ${form.tradeName} guardado`)
      setForm(empty)
      setOpen(false)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setPending(false)
    }
  }

  const filtered = rows.filter((row) => !query || `${row.tradeName} ${row.legalName ?? ""} ${row.taxId}`.toLowerCase().includes(query.toLowerCase()))
  const columns: GridColumn<Row>[] = [
    { key: "nombre", label: "Nombre comercial", value: (row) => row.tradeName, render: (row) => <b className="text-[var(--pf-navy)]">{row.tradeName}</b> },
    { key: "razon", label: "Razón social", value: (row) => row.legalName || "—" },
    { key: "ruc", label: "RUC", value: (row) => row.taxId || "—" },
    {
      key: "pago",
      label: "Pago",
      value: (row) => (row.paymentTerm === "CREDITO" ? `Crédito${row.creditDays ? ` ${row.creditDays} días` : ""}` : "Contado"),
      render: (row) => (
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${row.paymentTerm === "CREDITO" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
          {row.paymentTerm === "CREDITO" ? `Crédito${row.creditDays ? ` · ${row.creditDays} días` : ""}` : "Contado"}
        </span>
      ),
    },
    { key: "contacto", label: "Contacto", value: (row) => row.contact || "—" },
    { key: "telefono", label: "Teléfono", value: (row) => row.phone || "—" },
    { key: "correo", label: "Correo", value: (row) => row.email || "—" },
    { key: "estado", label: "Estado", value: (row) => (row.isActive ? "Activo" : "Inactivo") },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Proveedores</h1>
          <p className="mt-1 text-sm text-slate-500">{rows.length} proveedor(es) de este negocio.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white shadow-sm"
        >
          <Plus size={16} /> Nuevo proveedor <ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

      {open ? (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
          <Field label="RUC" hint="Escribe el RUC y pulsa Buscar para traer razón social y dirección.">
            <span className="flex gap-2">
              <input inputMode="numeric" className={input} value={form.taxId} onChange={(e) => set("taxId")(e.target.value)} placeholder="Ej. 20100055237" />
              <DocumentLookup
                value={form.taxId}
                onFound={(party) =>
                  setForm((current) => ({
                    ...current,
                    taxId: party.document,
                    legalName: party.name,
                    tradeName: current.tradeName || party.name,
                    address: party.address || current.address,
                  }))
                }
              />
            </span>
          </Field>
          <Field label="Nombre comercial *" hint="Como lo conoces en tu negocio.">
            <input required className={input} value={form.tradeName} onChange={(e) => set("tradeName")(e.target.value)} placeholder="Ej. Distribuidora Lima Norte" />
          </Field>
          <Field label="Razón social" wide>
            <input className={input} value={form.legalName} onChange={(e) => set("legalName")(e.target.value)} placeholder="Ej. DISTRIBUIDORA LIMA NORTE S.A.C." />
          </Field>
          <Field label="Condición de pago" hint="Contado: pagas al recibir. Crédito: queda en Compras → Por pagar.">
            <select className={input} value={form.paymentTerm} onChange={(e) => set("paymentTerm")(e.target.value)}>
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </Field>
          {form.paymentTerm === "CREDITO" ? (
            <Field label="Días de crédito">
              <input inputMode="numeric" className={input} value={form.creditDays} onChange={(e) => set("creditDays")(e.target.value)} placeholder="Ej. 30" />
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}
          <Field label="Contacto">
            <input className={input} value={form.contact} onChange={(e) => set("contact")(e.target.value)} placeholder="Ej. Juan Pérez (vendedor)" />
          </Field>
          <Field label="Teléfono">
            <input inputMode="tel" className={input} value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="Ej. 987 654 321" />
          </Field>
          <Field label="Correo">
            <input type="email" className={input} value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="Ej. ventas@proveedor.com" />
          </Field>
          <Field label="Dirección">
            <input className={input} value={form.address} onChange={(e) => set("address")(e.target.value)} placeholder="Ej. Av. Túpac Amaru 1234, Comas" />
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" disabled={pending} className="h-11 rounded-xl bg-[var(--pf-accent)] px-5 text-sm font-semibold text-white disabled:opacity-60">
              {pending ? "Guardando…" : "Guardar proveedor"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setForm(empty)
              }}
              className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <input className={`${filterInput} w-64`} placeholder="Buscar proveedor o RUC…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button
          type="button"
          onClick={() => downloadGrid("proveedores", columns, filtered)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"
        >
          <FileSpreadsheet size={16} /> Excel
        </button>
      </div>
      <DataGrid columns={columns} rows={filtered} rowKey={(row) => row.id} empty="Todavía no hay proveedores. Usa «Nuevo proveedor»." />
    </div>
  )
}
