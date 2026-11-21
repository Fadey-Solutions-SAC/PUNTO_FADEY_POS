import { useEffect, useState } from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import { getSaleTicket } from "../api"
import { printDocumentTicket, printSaleTicket } from "../assistant"

export function TicketPage() {
  const { saleId = "" } = useParams()
  const state = (useLocation().state ?? null) as {
    received?: string
    change?: string
    currency?: string
    documentId?: string
    documentOk?: boolean
    documentError?: string
    debtNote?: string
  } | null
  const change = state?.change ? (state as { received: string; change: string; currency: string }) : null
  const [printing, setPrinting] = useState(false)
  const [printMessage, setPrintMessage] = useState<{ text: string; ok: boolean } | null>(null)

  async function toTicketPrinter() {
    setPrinting(true)
    setPrintMessage(null)
    try {
      if (state?.documentId) await printDocumentTicket(state.documentId)
      else await printSaleTicket(saleId)
      setPrintMessage({ text: "Enviado a la ticketera", ok: true })
    } catch (err) {
      setPrintMessage({ text: err instanceof Error ? err.message : "No se pudo imprimir", ok: false })
    } finally {
      setPrinting(false)
    }
  }
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
    // Un iframe oculto: window.open con "noopener" devuelve null y no imprimía.
    const frame = document.createElement("iframe")
    frame.setAttribute("aria-hidden", "true")
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    if (!doc || !frame.contentWindow) {
      frame.remove()
      return
    }
    doc.open()
    doc.write(`<!doctype html><html><head><title>Ticket ${meta?.code ?? ""}</title>
<style>@page{margin:4mm}body{font-family:ui-monospace,Consolas,monospace;white-space:pre;margin:0;font-size:12px}</style>
</head><body>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</body></html>`)
    doc.close()
    const win = frame.contentWindow
    window.setTimeout(() => {
      win.focus()
      win.print()
      window.setTimeout(() => frame.remove(), 1000)
    }, 50)
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
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            disabled={printing}
            onClick={() => void toTicketPrinter()}
            className="h-11 rounded-xl bg-teal-600 px-4 font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
          >
            {printing ? "Imprimiendo…" : "Ticketera"}
          </button>
          <button
            type="button"
            onClick={printTicket}
            className="h-11 rounded-xl border border-slate-200 bg-white px-4 font-medium text-[var(--pf-navy)] shadow-sm hover:bg-slate-50"
          >
            Imprimir en esta PC
          </button>
          <Link
            to="/ventas"
            autoFocus
            className="inline-flex h-11 items-center rounded-xl bg-[var(--pf-accent)] px-4 font-semibold text-white shadow-sm hover:brightness-110"
          >
            Nueva venta
          </Link>
        </div>
      </div>
      {printMessage ? (
        <p className={`rounded-xl px-3 py-2 text-sm ${printMessage.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{printMessage.text}</p>
      ) : null}
      {state?.debtNote ? (
        <p className={`rounded-xl px-3 py-2 text-sm font-medium ${state.debtNote.startsWith("Deuda cobrada") ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          {state.debtNote}
        </p>
      ) : null}
      {state?.documentOk ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">✓ SUNAT aceptó el comprobante. Quedó en Facturación con su CDR y PDF.</p>
      ) : null}
      {state?.documentError ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {state.documentError}{" "}
          <Link to="/facturacion" className="font-semibold underline">
            Revisar o reintentar en Facturación
          </Link>
        </p>
      ) : null}
      {change ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">Recibido</p>
            <p className="text-xl font-semibold tabular-nums text-[var(--pf-navy)]">
              {change.received} <span className="text-sm text-slate-500">{change.currency}</span>
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
            <p className="text-xs text-emerald-700">Vuelto a entregar</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700">
              {change.change} <span className="text-sm">{change.currency}</span>
            </p>
          </div>
        </div>
      ) : null}
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
