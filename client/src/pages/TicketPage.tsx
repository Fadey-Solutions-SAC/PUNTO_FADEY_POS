import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getSaleTicket } from "../api"

export function TicketPage() {
  const { saleId = "" } = useParams()
  const [text, setText] = useState("")
  const [meta, setMeta] = useState<{ code: string; total: string; subtotal: string; discount: string } | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!saleId) return
    getSaleTicket(saleId)
      .then((ticket) => {
        setText(ticket.text)
        setMeta({
          code: ticket.code,
          total: ticket.total,
          subtotal: ticket.subtotal,
          discount: ticket.discount,
        })
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [saleId])

  function printTicket() {
    const win = window.open("", "_blank", "noopener,noreferrer,width=420,height=640")
    if (!win) return
    win.document.write(`<!doctype html><html><head><title>Ticket ${meta?.code ?? ""}</title>
<style>body{font-family:ui-monospace,Consolas,monospace;white-space:pre;padding:16px;font-size:12px}</style>
</head><body>${text.replace(/</g, "&lt;")}</body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        <Link to="/ventas" className="text-sm text-[var(--pf-accent)] hover:underline">
          Nueva venta
        </Link>
      </div>
    )
  }

  if (!meta) return <p className="text-sm text-slate-500">Cargando ticket…</p>

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Ticket {meta.code}</h1>
          <p className="mt-1 text-sm text-slate-500">Total {meta.total}</p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link to="/ventas" className="font-medium text-[var(--pf-accent)] hover:underline">
            Nueva venta
          </Link>
          <button type="button" onClick={printTicket} className="font-medium text-[var(--pf-navy)] hover:underline">
            Imprimir
          </button>
        </div>
      </div>
      <pre className="overflow-auto rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-800 shadow-sm">
        {text}
      </pre>
      <p className="text-sm text-slate-500">
        Subtotal {meta.subtotal}
        {meta.discount !== "S/ 0.00" && meta.discount !== "$ 0.00" ? ` · Descuento ${meta.discount}` : ""}
      </p>
    </div>
  )
}
