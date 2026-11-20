import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  discardQueuedSale,
  getQueuedSale,
  listQueuedSales,
  OFFLINE_EVENT,
  syncedSaleId,
  syncQueuedSales,
  type QueuedSale,
} from "../offline"

function money(cents: number) {
  return (cents / 100).toFixed(2)
}

function useQueue() {
  const [items, setItems] = useState<QueuedSale[]>(() => listQueuedSales())
  useEffect(() => {
    const sync = () => setItems(listQueuedSales())
    window.addEventListener(OFFLINE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(OFFLINE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  return items
}

function ticketText(sale: QueuedSale) {
  const width = 32
  const line = "-".repeat(width)
  const row = (left: string, right: string) => `${left}${" ".repeat(Math.max(1, width - left.length - right.length))}${right}`
  const out = [
    "VENTA SIN CONEXIÓN".padStart(25),
    "(pendiente de envío)".padStart(26),
    line,
    `Fecha: ${new Date(sale.createdAt).toLocaleString("es-PE")}`,
    `Clave: ${sale.id.slice(0, 8).toUpperCase()}`,
    line,
  ]
  for (const item of sale.lines) {
    out.push(`${item.name} ${item.presentationName}`.slice(0, width))
    out.push(row(`  ${item.quantity} x ${money(item.unitPriceCents)}`, money(item.unitPriceCents * item.quantity)))
  }
  out.push(line)
  if (sale.discountCents > 0) out.push(row("Descuento", `-${money(sale.discountCents)}`))
  out.push(row("TOTAL", `${sale.currency === "PEN" ? "S/ " : ""}${money(sale.totalCents)}`))
  out.push(row("Recibido", money(sale.receivedCents)))
  if (sale.changeCents > 0) out.push(row("Vuelto", money(sale.changeCents)))
  out.push(line, "Se registrará al volver internet.".padStart(32))
  return out.join("\n")
}

function printText(text: string) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc || !frame.contentWindow) return frame.remove()
  doc.open()
  doc.write(
    `<!doctype html><html><head><style>@page{margin:4mm}body{font-family:ui-monospace,Consolas,monospace;white-space:pre;margin:0;font-size:12px}</style></head><body>${text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</body></html>`,
  )
  doc.close()
  const win = frame.contentWindow
  window.setTimeout(() => {
    win.focus()
    win.print()
    window.setTimeout(() => frame.remove(), 1000)
  }, 50)
}

/** Ticket provisional de una venta guardada en el equipo. */
export function OfflineTicketPage() {
  const { queueId = "" } = useParams()
  const items = useQueue()
  const sale = items.find((item) => item.id === queueId) ?? getQueuedSale(queueId)
  const realId = syncedSaleId(queueId)

  if (!sale) {
    return (
      <div className="mx-auto max-w-lg space-y-3">
        {realId ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <p className="font-semibold">Venta sincronizada ✓</p>
            <p className="text-sm">Ya está registrada en el servidor.</p>
            <Link to={`/ventas/${realId}/ticket`} className="mt-2 inline-block text-sm font-semibold underline">
              Ver ticket definitivo
            </Link>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Esta venta ya no está en la cola de este equipo.</p>
        )}
        <Link to="/ventas" className="inline-flex h-11 items-center rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white">
          Nueva venta
        </Link>
      </div>
    )
  }

  const text = ticketText(sale)
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Venta guardada sin conexión</h1>
          <p className="mt-1 text-sm text-slate-500">Total {sale.currency === "PEN" ? "S/ " : ""}{money(sale.totalCents)}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => printText(text)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-4 font-medium text-[var(--pf-navy)] shadow-sm"
          >
            Imprimir
          </button>
          <Link
            to="/ventas"
            autoFocus
            className="inline-flex h-11 items-center rounded-xl bg-[var(--pf-accent)] px-4 font-semibold text-white shadow-sm"
          >
            Nueva venta
          </Link>
        </div>
      </div>

      <div
        className={`rounded-2xl border px-4 py-3 text-sm ${
          sale.status === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
      >
        {sale.status === "error" ? (
          <>
            <b>El servidor la rechazó:</b> {sale.error}. Revísala en{" "}
            <Link to="/ventas/sincronizar" className="font-semibold underline">
              ventas por sincronizar
            </Link>
            .
          </>
        ) : (
          <>
            <b>Pendiente de envío.</b> Está guardada en este equipo y se registrará sola cuando vuelva internet. No borres
            los datos del navegador.
          </>
        )}
      </div>

      {sale.changeCents > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">Recibido</p>
            <p className="text-xl font-semibold tabular-nums text-[var(--pf-navy)]">{money(sale.receivedCents)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
            <p className="text-xs text-emerald-700">Vuelto a entregar</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700">{money(sale.changeCents)}</p>
          </div>
        </div>
      ) : null}

      <pre className="overflow-auto rounded-2xl border border-dashed border-amber-300 bg-white p-4 text-xs leading-relaxed text-slate-800 shadow-sm">
        {text}
      </pre>
    </div>
  )
}

/** Lista de ventas guardadas en el equipo: enviar, reintentar o descartar. */
export function SyncPage() {
  const items = useQueue()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function run(retryErrors: boolean) {
    setBusy(true)
    setMessage("")
    const result = await syncQueuedSales({ retryErrors })
    setBusy(false)
    if (result.offline) setMessage("Todavía sin conexión con el servidor. Se reintentará sola.")
    else if (result.sent || result.failed)
      setMessage(
        `${result.sent} enviada${result.sent === 1 ? "" : "s"}${result.failed ? ` · ${result.failed} con error` : ""}.`,
      )
    else setMessage("No había ventas para enviar.")
  }

  const pendingTotal = items.reduce((sum, item) => sum + item.totalCents, 0)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Ventas por sincronizar</h1>
          <p className="mt-1 text-sm text-slate-500">
            Guardadas en este equipo mientras no había conexión. Se envían solas cada 30 segundos y al volver internet.
          </p>
        </div>
        <div className="flex gap-2">
          {items.some((item) => item.status === "error") ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(true)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[var(--pf-navy)] shadow-sm disabled:opacity-60"
            >
              Reintentar con error
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || items.length === 0}
            onClick={() => void run(false)}
            className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Enviando…" : "Sincronizar ahora"}
          </button>
        </div>
      </div>

      {message ? <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-sm text-emerald-800">
          ✓ Todo sincronizado. No hay ventas pendientes en este equipo.
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {items.length} venta{items.length === 1 ? "" : "s"} · total {money(pendingTotal)}
          </p>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={`rounded-2xl border bg-white p-3 shadow-sm ${item.status === "error" ? "border-red-200" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--pf-navy)]">
                      {new Date(item.createdAt).toLocaleString("es-PE")} ·{" "}
                      <span className="tabular-nums text-teal-700">{money(item.totalCents)}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {item.lines.map((line) => `${line.quantity}× ${line.name}`).join(", ")}
                    </p>
                    {item.status === "error" ? (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        Rechazada: {item.error} (intentos: {item.attempts})
                      </p>
                    ) : (
                      <p className="mt-1 text-xs font-medium text-amber-700">Pendiente de envío</p>
                    )}
                  </div>
                  <div className="flex gap-2 text-xs">
                    <Link
                      to={`/ventas/pendiente/${item.id}`}
                      className="rounded-lg px-2 py-1 font-semibold text-[var(--pf-accent)] hover:bg-[var(--pf-accent)]/10"
                    >
                      Ticket
                    </Link>
                    {item.status === "error" ? (
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 font-semibold text-red-700 hover:bg-red-50"
                        onClick={() => {
                          if (window.confirm("¿Descartar esta venta? No se registrará en el sistema.")) discardQueuedSale(item.id)
                        }}
                      >
                        Descartar
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            Si una venta fue rechazada (por ejemplo, stock insuficiente o caja cerrada), corrige el motivo —registra la
            entrada de mercadería o abre la caja— y pulsa “Reintentar con error”. Solo descártala si no se concretó.
          </p>
        </>
      )}
    </div>
  )
}
