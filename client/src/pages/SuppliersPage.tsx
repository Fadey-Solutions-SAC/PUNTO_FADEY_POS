import { useEffect, useState, type FormEvent } from "react"
import { getSuppliers, saveSupplier } from "../api"
import { DocumentLookup } from "../components/DocumentLookup"

const empty = {
  tradeName: "",
  legalName: "",
  taxId: "",
  contact: "",
  phone: "",
  email: "",
  address: "",
}

export function SuppliersPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getSuppliers>>["suppliers"]>([])
  const [form, setForm] = useState(empty)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function reload() {
    setRows((await getSuppliers()).suppliers)
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await saveSupplier(form)
      setForm(empty)
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
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Proveedores</h1>
        <p className="mt-1 text-sm text-slate-500">Cada proveedor pertenece solo a este negocio.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        {(
          [
            ["tradeName", "Nombre comercial", true],
            ["legalName", "Razón social", false],
            ["taxId", "RUC o documento", false],
            ["contact", "Contacto", false],
            ["phone", "Teléfono", false],
            ["email", "Correo", false],
            ["address", "Dirección", false],
          ] as const
        ).map(([key, label, required]) => (
          <label key={key} className={`block text-sm ${key === "address" ? "sm:col-span-2" : ""}`}>
            {label}
            <span className="flex gap-2">
              <input
                required={required}
                type={key === "email" ? "email" : "text"}
                inputMode={key === "taxId" ? "numeric" : undefined}
                className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2"
                value={form[key]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              />
              {key === "taxId" ? (
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
              ) : null}
            </span>
          </label>
        ))}
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:w-fit"
        >
          {pending ? "Guardando…" : "Guardar proveedor"}
        </button>
      </form>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Documento</th>
              <th className="px-3 py-2 font-medium">Teléfono</th>
              <th className="px-3 py-2 font-medium">Correo</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-[var(--pf-navy)]">{row.tradeName}</td>
                <td className="px-3 py-2">{row.taxId || "—"}</td>
                <td className="px-3 py-2">{row.phone || "—"}</td>
                <td className="px-3 py-2">{row.email || "—"}</td>
                <td className="px-3 py-2">{row.isActive ? "Activo" : "Inactivo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
