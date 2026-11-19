import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getSaleDetail, voidSale } from "../api"

export function SaleDetailPage() {
  const { saleId = "" } = useParams()
  const [sale, setSale] = useState<Awaited<ReturnType<typeof getSaleDetail>> | null>(null)
  const [error, setError] = useState("")
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [stockMode, setStockMode] = useState<"restore" | "keep">("restore")
  const [pending, setPending] = useState(false)

  async function reload() {
    const detail = await getSaleDetail(saleId)
    setSale(detail)
  }

  useEffect(() => {
    if (!saleId) return
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [saleId])

  async function onVoid() {
    setPending(true)
    setError("")
    try {
      await voidSale(saleId, reason, stockMode)
      setOpen(false)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular")
    } finally {
      setPending(false)
    }
  }

  if (!sale && !error) return <p className="text-sm text-slate-500">Cargando venta…</p>
  if (error && !sale) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        <Link to="/ventas/historial" className="text-sm text-[var(--pf-accent)] hover:underline">
          Volver al historial
        </Link>
      </div>
    )
  }
  if (!sale) return null

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Venta {sale.code}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {sale.createdAtLabel} · {sale.statusLabel} · {sale.userName}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to={`/ventas/${sale.id}/ticket`} className="font-medium text-[var(--pf-accent)] hover:underline">
            Ticket
          </Link>
          <Link to="/ventas/historial" className="font-medium text-[var(--pf-navy)] hover:underline">
            Historial
          </Link>
          {sale.status === "COMPLETED" ? (
            <Link
              to={`/ventas/devoluciones?venta=${sale.id}`}
              className="font-medium text-[var(--pf-navy)] hover:underline"
            >
              Devolver
            </Link>
          ) : null}
          {sale.canVoid ? (
            <button type="button" onClick={() => setOpen(true)} className="font-medium text-red-600 hover:underline">
              Anular
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Cliente: {sale.customerName}</p>
        {sale.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{sale.notes}</p> : null}
        <ul className="mt-3 space-y-2 text-sm">
          {sale.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 border-t border-slate-100 pt-2">
              <span>
                {line.description}
                <span className="block text-xs text-slate-500">
                  {line.quantityLabel} × {line.unitPrice}
                </span>
              </span>
              <span className="font-medium">{line.total}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>{sale.subtotal}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Descuento</span>
            <span>{sale.discount}</span>
          </div>
          <div className="mt-1 flex justify-between text-lg font-semibold text-[var(--pf-navy)]">
            <span>Total</span>
            <span>{sale.total}</span>
          </div>
          <div className="mt-2 space-y-1 text-slate-600">
            {sale.payments.map((payment, index) => (
              <div key={index} className="flex justify-between">
                <span>{payment.label}</span>
                <span>{payment.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
            <h2 className="font-semibold text-[var(--pf-navy)]">Anular venta</h2>
            <p className="mt-1 text-sm text-slate-500">Queda con etiqueta Anulada y no suma en totales.</p>
            <label className="mt-3 block text-sm">
              Motivo
              <textarea
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <fieldset className="mt-3 space-y-2 text-sm">
              <legend className="font-medium text-[var(--pf-navy)]">Stock</legend>
              <label className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <input
                  type="radio"
                  className="mt-1"
                  checked={stockMode === "restore"}
                  onChange={() => setStockMode("restore")}
                />
                <span>
                  <span className="font-medium">Devolver stock</span>
                  <span className="block text-xs text-slate-500">Regresa los productos al almacén.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <input type="radio" className="mt-1" checked={stockMode === "keep"} onChange={() => setStockMode("keep")} />
                <span>
                  <span className="font-medium">Mantener stock</span>
                  <span className="block text-xs text-slate-500">No mueve inventario.</span>
                </span>
              </label>
            </fieldset>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={onVoid}
                className="h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Anulando…" : "Confirmar"}
              </button>
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-10 rounded-xl px-4 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
