import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react"
import { getAssistantBilling, saveAssistantBilling, type AssistantBilling } from "../api"
import {
  ASSISTANT_DOWNLOAD_URL,
  discover,
  efactReachable,
  listPrinters,
  printerStatus,
  probe,
  readCashierPrinter,
  readPrefs,
  saveCashierPrinter,
  saveOrigin,
  savePrefs,
  savedOrigin,
  testPrint,
} from "../lib/local-assistant"

const input = "mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-50"

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  )
}

/** Configuración → Impresión y SUNAT: el mismo asistente local (Fadey Impresión) que usa Resto Fadey. */
export function AssistantSettings() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PrintingPanel />
      <SunatPanel />
    </div>
  )
}

type Link = "buscando" | "conectado" | "sin-asistente"

function PrintingPanel() {
  const [link, setLink] = useState<Link>("buscando")
  const [origin, setOrigin] = useState("")
  const [manual, setManual] = useState("")
  const [printers, setPrinters] = useState<string[]>([])
  const [tipo, setTipo] = useState<"usb" | "red">("usb")
  const [nombre, setNombre] = useState("")
  const [ip, setIp] = useState("")
  const [puerto, setPuerto] = useState("9100")
  const [paper, setPaper] = useState<58 | 80>(80)
  const [autoPrint, setAutoPrint] = useState(true)
  const [efact, setEfact] = useState<boolean | null>(null)
  const [status, setStatus] = useState("")
  const [ownPrinter, setOwnPrinter] = useState(true)
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function connect(candidate?: string, first = false) {
    if (first) {
      const prefs = readPrefs()
      setAutoPrint(prefs.autoPrint)
      setPaper(prefs.paperWidth)
    }
    setLink("buscando")
    setMessage("")
    setFailed(false)
    if (candidate !== undefined) {
      if (!(await probe(candidate))) {
        setLink("sin-asistente")
        setFailed(true)
        setMessage("Esa dirección no responde como asistente de impresión")
        return
      }
      saveOrigin(candidate)
    }
    const found = await discover()
    setOrigin(found)
    setManual(found || savedOrigin() || "http://127.0.0.1:3002")
    if (!found) {
      setLink("sin-asistente")
      setEfact(await efactReachable().catch(() => false))
      return
    }
    setLink("conectado")
    try {
      const [names, current, state] = await Promise.all([listPrinters(), readCashierPrinter(), printerStatus().catch(() => null)])
      setPrinters(names)
      setTipo(current.tipo)
      setNombre(current.nombre)
      setIp(current.ip)
      setPuerto(String(current.puerto || 9100))
      setPaper(current.paperWidth)
      setOwnPrinter(current.own)
      setStatus(state?.label ?? "")
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : "No se pudo leer la impresora")
    }
    setEfact(await efactReachable().catch(() => false))
  }

  useEffect(() => {
    void connect(undefined, true)
  }, [])

  async function save() {
    setBusy(true)
    setMessage("")
    setFailed(false)
    try {
      savePrefs({ autoPrint, paperWidth: paper })
      await saveCashierPrinter({ tipo, nombre, ip, puerto: Number(puerto) || 9100, paperWidth: paper })
      const state = await printerStatus().catch(() => null)
      setStatus(state?.label ?? "")
      setOwnPrinter(true)
      setMessage("Impresora de Punto Fadey guardada en el asistente (no cambia la de Resto Fadey)")
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setMessage("")
    setFailed(false)
    try {
      await testPrint()
      setMessage("Prueba enviada a la ticketera")
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : "No se pudo imprimir la prueba")
    } finally {
      setBusy(false)
    }
  }

  const badge = link === "conectado" ? "bg-emerald-50 text-emerald-700" : link === "buscando" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--pf-navy)]">Asistente de impresión</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>
          {link === "conectado" ? "Conectado" : link === "buscando" ? "Buscando…" : "No encontrado"}
        </span>
      </div>
      <p className="text-sm text-slate-500">
        Es el programa <b>Fadey Impresión</b> instalado en la PC de caja (el mismo de Resto Fadey). Imprime los tickets en la ticketera y firma los comprobantes para
        SUNAT. La conexión y la impresora quedan guardadas en esta PC.
      </p>

      {link === "sin-asistente" ? (
        <div className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <p className="font-semibold">El asistente no responde en esta PC.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              Si el ícono de <b>Resto FADEY</b> junto al reloj dice <b>«en espera (sin usuarios en el sistema)»</b>: haz clic derecho sobre él y elige{" "}
              <b>«Reintentar servicio de impresión»</b>. Luego pulsa «Buscar de nuevo».
            </li>
            <li>Si no aparece el ícono, abre Resto FADEY desde el menú de Windows o instálalo.</li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={ASSISTANT_DOWNLOAD_URL} className="inline-flex h-9 items-center rounded-lg bg-[var(--pf-accent)] px-3 text-sm font-semibold text-white">
              Descargar asistente
            </a>
            <button type="button" onClick={() => void connect()} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
              Buscar de nuevo
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="Dirección del asistente">
          <input className={input} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="http://127.0.0.1:3002" />
        </Field>
        <button type="button" onClick={() => void connect(manual)} className="h-11 self-end rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
          Conectar
        </button>
      </div>
      {origin ? (
        <p className="-mt-2 text-xs text-slate-500">
          En uso: {origin}
          {status ? ` · Ticketera: ${status}` : ""}
        </p>
      ) : null}

      {link === "conectado" ? (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          El asistente es el mismo de Resto Fadey. Punto Fadey guarda su propia impresora y no cambia la de caja, cocina ni bar de Resto.
          {!ownPrinter ? " Por ahora usa la impresora de caja de Resto; guarda una aquí si quieres otra." : ""}
        </p>
      ) : null}

      <fieldset disabled={link !== "conectado" || busy} className="grid gap-3 disabled:opacity-60 sm:grid-cols-2">
        <Field label="Conexión de la ticketera">
          <select className={input} value={tipo} onChange={(e) => setTipo(e.target.value === "red" ? "red" : "usb")}>
            <option value="usb">USB (instalada en Windows)</option>
            <option value="red">Red (IP)</option>
          </select>
        </Field>
        <Field label="Ancho del papel">
          <select className={input} value={paper} onChange={(e) => setPaper(e.target.value === "58" ? 58 : 80)}>
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </select>
        </Field>
        {tipo === "usb" ? (
          <Field label="Impresora" wide>
            <select className={input} value={nombre} onChange={(e) => setNombre(e.target.value)}>
              <option value="">Elige la ticketera</option>
              {printers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="IP">
              <input className={input} value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.50" />
            </Field>
            <Field label="Puerto">
              <input className={input} value={puerto} onChange={(e) => setPuerto(e.target.value)} inputMode="numeric" placeholder="Ej. 9100" />
            </Field>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" className="size-4" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
          Imprimir el ticket automáticamente al cobrar
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="button" onClick={() => void save()} className="h-11 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white">
            Guardar impresora
          </button>
          <button type="button" onClick={() => void test()} className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
            Imprimir prueba
          </button>
        </div>
      </fieldset>

      {message ? <p className={`text-sm ${failed ? "text-red-700" : "text-emerald-700"}`}>{message}</p> : null}

      <div className="border-t border-slate-100 pt-3 text-sm">
        <p className="font-semibold text-[var(--pf-navy)]">Facturación por el asistente</p>
        <p className={`mt-1 ${efact ? "text-emerald-700" : "text-slate-500"}`}>
          {efact === null ? "Revisando…" : efact ? "✓ El servicio de SUNAT del asistente responde en esta PC." : "El servicio de SUNAT del asistente no responde en esta PC."}
        </p>
      </div>
    </section>
  )
}

const TEXT_FIELDS = ["tradeName", "address", "ubigeo", "department", "province", "district", "phone", "email", "solUser"] as const

function SunatPanel() {
  const [data, setData] = useState<AssistantBilling | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [solPassword, setSolPassword] = useState("")
  const [certPassword, setCertPassword] = useState("")
  const [cert, setCert] = useState<{ name: string; base64: string } | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function load() {
    const current = await getAssistantBilling()
    setData(current)
    setForm(Object.fromEntries(TEXT_FIELDS.map((key) => [key, current[key]])))
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function onCert(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ""
    for (const byte of bytes) binary += String.fromCharCode(byte)
    setCert({ name: file.name, base64: btoa(binary) })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const result = await saveAssistantBilling({
        ...form,
        solPassword,
        certPassword,
        ...(cert ? { certBase64: cert.base64, certName: cert.name } : {}),
      })
      setSolPassword("")
      setCertPassword("")
      setCert(null)
      await load()
      setMessage(result.ready ? "Datos SUNAT guardados. Ya puedes emitir con el asistente." : "Guardado. Aún faltan datos para emitir.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  const set = (key: string) => (event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--pf-navy)]">SUNAT por el asistente local</h3>
        {data ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${data.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            {data.ready ? "Listo para emitir" : "Faltan datos"}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-slate-500">
        El asistente firma la boleta o factura con tu certificado y la envía a SUNAT. La clave SOL, el certificado y su contraseña se guardan cifrados y solo se
        entregan al asistente al emitir. El RUC y la razón social salen de Configuración → Negocio; el ambiente (pruebas o producción) y el IGV, de Facturación →
        Configuración.
      </p>
      {!data ? <p className="text-sm text-slate-500">Cargando…</p> : null}
      <fieldset disabled={!data || busy} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre comercial">
          <input className={input} value={form.tradeName ?? ""} onChange={set("tradeName")} placeholder="Como aparece en el ticket" />
        </Field>
        <Field label="Ubigeo">
          <input className={input} value={form.ubigeo ?? ""} onChange={set("ubigeo")} placeholder="150101" inputMode="numeric" maxLength={6} />
        </Field>
        <Field label="Dirección fiscal" wide>
          <input className={input} value={form.address ?? ""} onChange={set("address")} placeholder="Ej. Av. Los Olivos 245" />
        </Field>
        <Field label="Departamento">
          <input className={input} value={form.department ?? ""} onChange={set("department")} placeholder="Ej. LIMA" />
        </Field>
        <Field label="Provincia">
          <input className={input} value={form.province ?? ""} onChange={set("province")} placeholder="Ej. LIMA" />
        </Field>
        <Field label="Distrito">
          <input className={input} value={form.district ?? ""} onChange={set("district")} placeholder="Ej. SAN MARTIN DE PORRES" />
        </Field>
        <Field label="Teléfono">
          <input className={input} value={form.phone ?? ""} onChange={set("phone")} placeholder="Ej. 987 654 321" />
        </Field>
        <Field label="Correo" wide>
          <input type="email" className={input} value={form.email ?? ""} onChange={set("email")} placeholder="Ej. ventas@minegocio.com" />
        </Field>
        <Field label="Usuario SOL">
          <input className={input} value={form.solUser ?? ""} onChange={set("solUser")} autoComplete="off" placeholder="Ej. MODDATOS" />
        </Field>
        <Field label="Clave SOL">
          <input
            type="password"
            className={input}
            value={solPassword}
            onChange={(e) => setSolPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={data?.hasSolPassword ? "Guardada. Escribe otra para cambiarla" : "Clave SOL"}
          />
        </Field>
        <Field label="Certificado digital (.pfx)">
          <input type="file" accept=".pfx,.p12" onChange={(e) => void onCert(e)} className="mt-1 block w-full text-sm" />
        </Field>
        <Field label="Contraseña del certificado">
          <input
            type="password"
            className={input}
            value={certPassword}
            onChange={(e) => setCertPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={data?.hasCertPassword ? "Guardada. Escribe otra para cambiarla" : "Contraseña"}
          />
        </Field>
      </fieldset>
      <p className="text-xs text-slate-500">
        {cert ? `Se subirá: ${cert.name}` : data?.certName ? `Certificado guardado: ${data.certName}` : "Todavía no hay certificado."}
      </p>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}
      <button type="submit" disabled={!data || busy} className="h-11 rounded-xl bg-[var(--pf-accent)] px-5 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? "Guardando…" : "Guardar datos SUNAT"}
      </button>
    </form>
  )
}
