import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { getPurchaseReception, postPurchaseReception } from "../api"

export function ReceptionPage() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<{ id: string; tradeName: string }[]>([])
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPurchaseReception>>["lines"]>([])
  const [supplierId, setSupplierId] = useState("")
  const [documentNumber, setDocumentNumber] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [key] = useState(() => crypto.randomUUID())

  useEffect(() => {
    getPurchaseReception()
      .then((data) => {
        setSuppliers(data.suppliers)
        setRows(data.lines)
        setSupplierId(data.suppliers[0]?.id ?? "")
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function onSubmit() {
    setPending(true)
    setError("")
    try {
      const result = await postPurchaseReception({
        supplierId,
        documentNumber,
        idempotencyKey: key,
        lines: rows
          .filter((row) => Number(row.quantity) > 0)
          .map((row) => ({
            productId: row.productId,
            presentationId: row.presentationId,
            quantity: row.quantity,
            unitCost: row.unitCost || "0",
          })),
      })
      navigate(`/pendiente/compras/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar")
    } finally {
      setPending(false)
    }
  }

  if (!error && rows.length === 0 && suppliers.length === 0) {
    return <p className="text-sm text-slate-500">Cargando recepción…</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Recepción</h1>
        <p className="mt-1 text-sm text-slate-500">Sale del requerimiento; anota cantidad comprada y costo.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">
          Todavía no hay lista. Ármala en{" "}
          <Link to="/compras/requerimiento" className="text-[var(--pf-accent)] hover:underline">
            Requerimiento
          </Link>
          .
        </p>
      ) : suppliers.length === 0 ? (
        <p className="text-sm text-slate-600">
          Registra un proveedor en{" "}
          <Link to="/compras/proveedores" className="text-[var(--pf-accent)] hover:underline">
            Proveedores
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Proveedor
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.tradeName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Documento
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                placeholder="Factura o guía"
              />
            </label>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Presentación</th>
                  <th className="px-3 py-2 font-medium">Cantidad</th>
                  <th className="px-3 py-2 font-medium">Costo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.productId} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {row.name}
                      <span className="block text-xs text-slate-500">{row.unit}</span>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-xl border border-slate-200 px-2 py-1.5"
                        value={row.presentationId}
                        onChange={(event) => {
                          const next = row.presentations.find((item) => item.id === event.target.value)
                          setRows((current) =>
                            current.map((item) =>
                              item.productId === row.productId
                                ? {
                                    ...item,
                                    presentationId: event.target.value,
                                    unitCost: next?.unitCost ?? item.unitCost,
                                  }
                                : item,
                            ),
                          )
                        }}
                      >
                        {row.presentations.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-24 rounded-xl border border-slate-200 px-3 py-2"
                        value={row.quantity}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.productId === row.productId ? { ...item, quantity: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-28 rounded-xl border border-slate-200 px-3 py-2"
                        value={row.unitCost}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.productId === row.productId ? { ...item, unitCost: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onSubmit}
            className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Registrando…" : "Registrar recepción"}
          </button>
        </>
      )}
    </div>
  )
}
