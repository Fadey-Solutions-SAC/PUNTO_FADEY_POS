import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { getBilling, issueBillingDocument } from "../api"

export function BillingPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getBilling>> | null>(null)
  const [saleId, setSaleId] = useState("")
  const [docType, setDocType] = useState("BOLETA")
  const [relatedId, setRelatedId] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function reload() {
    const payload = await getBilling()
    setData(payload)
    setSaleId((current) => current || payload.sales[0]?.id || "")
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function onIssue(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await issueBillingDocument({
        saleId,
        docType,
        relatedId: relatedId || undefined,
      })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo emitir")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Facturación electrónica</h1>
        <p className="mt-1 text-sm text-slate-500">
          El comprobante queda en cola hasta recibir la respuesta (CDR) del proveedor.
        </p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <form onSubmit={onIssue} className="grid max-w-xl gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm">
          Venta
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={saleId}
            onChange={(event) => setSaleId(event.target.value)}
          >
            {(data?.sales ?? []).map((sale) => (
              <option key={sale.id} value={sale.id}>
                {sale.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Comprobante
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={docType}
            onChange={(event) => setDocType(event.target.value)}
          >
            <option value="BOLETA">Boleta</option>
            <option value="FACTURA">Factura</option>
            <option value="NOTA_CREDITO">Nota de crédito</option>
            <option value="NOTA_DEBITO">Nota de débito</option>
          </select>
        </label>
        <label className="block text-sm">
          Comprobante aceptado que modifica
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={relatedId}
            onChange={(event) => setRelatedId(event.target.value)}
          >
            <option value="">Ninguno</option>
            {(data?.accepted ?? []).map((document) => (
              <option key={document.id} value={document.id}>
                {document.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending || !saleId}
          className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Generando…" : "Generar comprobante"}
        </button>
      </form>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Comprobante</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(data?.documents ?? []).map((document) => (
              <tr key={document.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{document.issuedAtLabel}</td>
                <td className="px-3 py-2">
                  <Link to={`/pendiente/facturacion/${document.id}`} className="text-[var(--pf-accent)] hover:underline">
                    {document.label}
                  </Link>
                </td>
                <td className="px-3 py-2">{document.customerName}</td>
                <td className="px-3 py-2">{document.statusLabel}</td>
                <td className="px-3 py-2 text-right">{document.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
