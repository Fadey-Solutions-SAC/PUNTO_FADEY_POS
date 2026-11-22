import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import {
  getBilling,
  getBillingConfig,
  getSaleTicket,
  issueBillingDocument,
  saveBillingConfig,
  saveBillingSeries,
  sendBillingDocument,
  type BillingConfig,
} from "../api"
import { DocumentLookup } from "../components/DocumentLookup"
import { emitDocument, printDocumentTicket } from "../assistant"
import { readPrefs } from "../lib/local-assistant"

type Data = Awaited<ReturnType<typeof getBilling>>
type Doc = Data["documents"][number]

const STATUS_STYLE: Record<string, string> = {
  QUEUED: "bg-amber-50 text-amber-800",
  SENT: "bg-sky-50 text-sky-700",
  ACCEPTED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  ERROR: "bg-red-50 text-red-700",
}

function printText(title: string, text: string) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc || !frame.contentWindow) return frame.remove()
  doc.open()
  doc.write(
    `<!doctype html><html><head><title>${title}</title><style>@page{margin:4mm}body{font-family:ui-monospace,Consolas,monospace;margin:0;font-size:12px}.t{white-space:pre;display:table;margin:0 auto}</style></head><body><div class="t">${text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</div></body></html>`,
  )
  doc.close()
  const win = frame.contentWindow
  window.setTimeout(() => {
    win.focus()
    win.print()
    window.setTimeout(() => frame.remove(), 1000)
  }, 50)
}

export function BillingPage() {
  const [tab, setTab] = useState<"docs" | "config">("docs")
  const [data, setData] = useState<Data | null>(null)
  const [config, setConfig] = useState<BillingConfig | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const [docs, cfg] = await Promise.all([getBilling(), getBillingConfig()])
    setData(docs)
    setConfig(cfg)
  }, [])

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [reload])

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await action()
      await reload()
      setMessage(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
      await reload().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  async function onEmit(doc: Doc) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await emitDocument(doc.id, setMessage)
      setMessage(`SUNAT aceptó ${doc.label}`)
      if (readPrefs().autoPrint) await printDocumentTicket(doc.id).catch(() => undefined)
    } catch (err) {
      setMessage("")
      setError(err instanceof Error ? err.message : "No se pudo emitir")
    } finally {
      await reload().catch(() => undefined)
      setBusy(false)
    }
  }

  async function onPrint(doc: Doc) {
    if (!doc.saleId) return
    try {
      const ticket = await getSaleTicket(doc.saleId)
      const header = [
        config?.businessName ?? "",
        config?.taxId ? `RUC ${config.taxId}` : "",
        doc.label.toUpperCase(),
        `Cliente: ${doc.customerName}`,
        doc.status === "ACCEPTED" ? "Aceptado por SUNAT" : "REPRESENTACIÓN SIN CDR · NO ACEPTADO AÚN",
        "--------------------------------",
      ]
        .filter(Boolean)
        .join("\n")
      printText(doc.label, `${header}\n${ticket.text}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo imprimir")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-slate-500">
            Un comprobante solo queda <b>aceptado</b> con el CDR de SUNAT que devuelve tu proveedor. Mientras tanto queda en cola.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["docs", "Comprobantes"],
              ["config", "Configuración"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${tab === value ? "bg-white text-[var(--pf-navy)] shadow-sm" : "text-slate-500"}`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {config && (!config.taxIdValid || (!config.configured && !config.assistantReady)) ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {!config.taxIdValid ? (
            <p>
              <b>Falta un RUC válido del negocio.</b> Regístralo en{" "}
              <Link to="/configuracion?m=negocio" className="font-semibold underline">
                Configuración → Negocio
              </Link>{" "}
              para poder emitir.
            </p>
          ) : null}
          {!config.configured && !config.assistantReady ? (
            <p>
              <b>Falta configurar el envío a SUNAT.</b> Completa los datos del asistente local en{" "}
              <Link to="/configuracion?m=impresion" className="font-semibold underline">
                Configuración → Impresión y SUNAT
              </Link>{" "}
              (o un proveedor externo en la pestaña Configuración). Mientras tanto los comprobantes quedan en cola.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

      {tab === "docs" && data ? (
        <>
          <IssueForm data={data} busy={busy} onIssue={(input, ok) => run(() => issueBillingDocument(input), ok)} />

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-[var(--pf-navy)]">Comprobantes emitidos</h2>
              <span className="text-xs text-slate-500">{data.documents.length}</span>
            </div>
            {data.documents.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Todavía no hay comprobantes.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Comprobante</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.map((doc) => (
                      <tr key={doc.id}>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{doc.issuedAtLabel}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-[var(--pf-navy)]">{doc.label}</td>
                        <td className="px-3 py-2">{doc.customerName}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[doc.status] ?? "bg-slate-100"}`}>{doc.statusLabel}</span>
                          {doc.lastError ? <span className="mt-0.5 block max-w-[16rem] text-[11px] leading-tight text-red-700">{doc.lastError}</span> : null}
                          {doc.attempts ? <span className="block text-[11px] text-slate-400">Intentos: {doc.attempts}/5</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{doc.total}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap justify-end gap-1 text-xs font-semibold">
                            {doc.status !== "ACCEPTED" && (doc.docType === "BOLETA" || doc.docType === "FACTURA") ? (
                              <button
                                type="button"
                                disabled={busy || (doc.attempts ?? 0) >= 5}
                                onClick={() => void onEmit(doc)}
                                className="rounded-lg bg-emerald-600 px-2 py-1 text-white disabled:opacity-50"
                                title="Firmar y enviar a SUNAT con el asistente de esta PC"
                              >
                                {doc.attempts ? "Reintentar (asistente)" : "Emitir (asistente)"}
                              </button>
                            ) : null}
                            {doc.status !== "ACCEPTED" && config?.configured ? (
                              <button
                                type="button"
                                disabled={busy || (doc.attempts ?? 0) >= 5}
                                onClick={() => void run(() => sendBillingDocument(doc.id), "Respuesta del proveedor registrada")}
                                className="rounded-lg bg-sky-500 px-2 py-1 text-white disabled:opacity-50"
                              >
                                {doc.attempts ? "Reintentar" : "Enviar"}
                              </button>
                            ) : null}
                            {doc.saleId ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(() => printDocumentTicket(doc.id), "Enviado a la ticketera")}
                                className="rounded-lg px-2 py-1 text-teal-700 hover:bg-teal-50"
                              >
                                Ticketera
                              </button>
                            ) : null}
                            {doc.hasPdf ? (
                              <a href={`/api/billing/${doc.id}/pdf`} className="rounded-lg px-2 py-1 text-rose-700 hover:bg-rose-50">
                                PDF
                              </a>
                            ) : null}
                            <a href={`/api/billing/${doc.id}/xml`} className="rounded-lg px-2 py-1 text-[var(--pf-accent)] hover:bg-slate-100">
                              XML
                            </a>
                            {doc.hasCdr ? (
                              <a href={`/api/billing/${doc.id}/cdr`} className="rounded-lg px-2 py-1 text-emerald-700 hover:bg-emerald-50">
                                CDR
                              </a>
                            ) : null}
                            {doc.saleId ? (
                              <button type="button" onClick={() => void onPrint(doc)} className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100">
                                Imprimir
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {tab === "config" && config ? <ConfigPanel config={config} busy={busy} run={run} /> : null}
    </div>
  )
}

function IssueForm({
  data,
  busy,
  onIssue,
}: {
  data: Data
  busy: boolean
  onIssue: (input: { saleId: string; docType: string; relatedId?: string; buyerDocument?: string; buyerName?: string }, ok: string) => void
}) {
  const [saleId, setSaleId] = useState(data.sales[0]?.id ?? "")
  const [docType, setDocType] = useState("BOLETA")
  const [relatedId, setRelatedId] = useState("")
  const [buyerDocument, setBuyerDocument] = useState("")
  const [buyerName, setBuyerName] = useState("")
  const isNote = docType === "NOTA_CREDITO" || docType === "NOTA_DEBITO"

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    onIssue(
      {
        saleId,
        docType,
        relatedId: isNote ? relatedId || undefined : undefined,
        buyerDocument: buyerDocument.trim() || undefined,
        buyerName: buyerName.trim() || undefined,
      },
      "Comprobante generado. Envíalo para obtener el CDR.",
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
      <h2 className="font-semibold text-[var(--pf-navy)] md:col-span-2">Emitir comprobante</h2>
      <label className="block text-sm font-medium text-slate-700 md:col-span-2">
        Venta
        <select className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 text-sm" value={saleId} onChange={(e) => setSaleId(e.target.value)}>
          {data.sales.map((sale) => (
            <option key={sale.id} value={sale.id}>
              {sale.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 md:col-span-2">
        {(
          [
            ["BOLETA", "Boleta"],
            ["FACTURA", "Factura"],
            ["NOTA_CREDITO", "N. crédito"],
            ["NOTA_DEBITO", "N. débito"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            onClick={() => setDocType(value)}
            className={`h-9 rounded-lg text-xs font-semibold ${docType === value ? "bg-white text-[var(--pf-navy)] shadow-sm" : "text-slate-500"}`}
          >
            {text}
          </button>
        ))}
      </div>
      {!isNote ? (
        <>
          <label className="block text-sm font-medium text-slate-700">
            {docType === "FACTURA" ? "RUC del cliente (obligatorio)" : "DNI o RUC del cliente (opcional)"}
            <span className="flex gap-2">
              <input
                placeholder="Ej. 45678912 o 20601234567"
                inputMode="numeric"
                required={docType === "FACTURA"}
                className="mt-1 h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3"
                value={buyerDocument}
                onChange={(e) => setBuyerDocument(e.target.value)}
              />
              <DocumentLookup
                value={buyerDocument}
                onFound={(party) => {
                  setBuyerDocument(party.document)
                  setBuyerName(party.name)
                }}
              />
            </span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {docType === "FACTURA" ? "Razón social" : "Nombre"}
            <input
              required={docType === "FACTURA"}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder={docType === "BOLETA" ? "Vacío = cliente de la venta o Público" : ""}
            />
          </label>
        </>
      ) : (
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          Comprobante que modifica (solo aceptados)
          <select required className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 text-sm" value={relatedId} onChange={(e) => setRelatedId(e.target.value)}>
            <option value="">Elige el comprobante</option>
            {data.accepted.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" disabled={busy || !saleId} className="h-11 rounded-xl bg-[var(--pf-accent)] px-5 text-sm font-semibold text-white disabled:opacity-60 md:col-span-2 md:w-fit">
        {busy ? "Generando…" : "Generar comprobante"}
      </button>
    </form>
  )
}

function ConfigPanel({ config, busy, run }: { config: BillingConfig; busy: boolean; run: (action: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [endpoint, setEndpoint] = useState(config.endpoint)
  const [token, setToken] = useState("")
  const [environment, setEnvironment] = useState(config.environment)
  const [igvRate, setIgvRate] = useState(config.igvRate)
  const [series, setSeries] = useState<Record<string, string>>(Object.fromEntries(config.series.map((item) => [item.docType, item.series])))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-[var(--pf-navy)]">Asistente local (Fadey Impresión)</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.assistantReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {config.assistantReady ? "Listo para emitir" : "Faltan datos"}
          </span>
        </div>
        <p className="text-sm text-slate-600">
          Es el camino principal: el asistente de la PC de caja firma con tu certificado y envía a SUNAT. Sus datos (dirección fiscal, ubigeo, usuario y clave SOL,
          certificado) están en{" "}
          <Link to="/configuracion?m=impresion" className="font-semibold text-[var(--pf-accent)] underline">
            Configuración → Impresión y SUNAT
          </Link>
          . El ambiente y el IGV de abajo valen para los dos caminos.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            await saveBillingConfig({ endpoint, token: token || undefined, environment, igvRate })
            setToken("")
          }, "Configuración del proveedor guardada")
        }}
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="font-semibold text-[var(--pf-navy)]">Ambiente y proveedor externo (opcional)</h2>
        <label className="block text-sm font-medium text-slate-700">
          URL de envío
          <input
            type="url"
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.tu-proveedor.pe/..."
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Token {config.hasToken ? <span className="font-normal text-emerald-700">(guardado · vacío = no cambia)</span> : <span className="font-normal text-slate-400">(se guarda cifrado)</span>}
          <input type="password" autoComplete="off" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium text-slate-700">
            Ambiente
            <select className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 text-sm" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
              <option value="beta">Pruebas (beta)</option>
              <option value="prod">Producción</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            IGV (%)
            <input inputMode="decimal" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-right" value={igvRate} onChange={(e) => setIgvRate(e.target.value)} placeholder="Ej. 18" />
          </label>
        </div>
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-[var(--pf-accent)] px-5 text-sm font-semibold text-white disabled:opacity-60">
          Guardar proveedor
        </button>
        <p className="text-xs text-slate-500">El token nunca se muestra después de guardarlo. Solo se usa en el servidor para enviar los comprobantes.</p>
      </form>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-[var(--pf-navy)]">Series</h2>
        <p className="text-xs text-slate-500">4 caracteres (ej. B001, F001). Una serie con comprobantes emitidos ya no se puede cambiar.</p>
        {config.series.map((item) => (
          <form
            key={item.docType}
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void run(() => saveBillingSeries(item.docType, series[item.docType] ?? ""), `Serie de ${item.label} guardada`)
            }}
          >
            <span className="w-28 shrink-0 text-sm font-medium text-slate-700">{item.label}</span>
            <input
              placeholder="Ej. B001"
              disabled={item.locked}
              maxLength={4}
              className="h-10 w-24 rounded-xl border border-slate-200 px-3 text-center font-mono uppercase disabled:bg-slate-50"
              value={series[item.docType] ?? ""}
              onChange={(e) => setSeries((current) => ({ ...current, [item.docType]: e.target.value.toUpperCase() }))}
            />
            <span className="text-xs text-slate-500">próximo N.º {item.nextNumber}</span>
            {!item.locked ? (
              <button type="submit" disabled={busy} className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-[var(--pf-accent)] hover:bg-slate-100">
                Guardar
              </button>
            ) : (
              <span className="ml-auto text-xs text-slate-400">En uso</span>
            )}
          </form>
        ))}
      </div>
    </div>
  )
}
