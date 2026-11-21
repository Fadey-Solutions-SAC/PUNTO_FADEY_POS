import { useRef, useState } from "react"
import { saveSettingsHardwareReader } from "../api"
import { playScanPit, setReaderEnabled } from "./Scanner"

type Result = { code: string; ms: number; perChar: number; enter: boolean }

/**
 * Configuración → Lector de código.
 * Un lector USB o Bluetooth funciona como un teclado: «escribe» el código muy rápido y termina con Enter.
 * La prueba mide esa velocidad y confirma que envía Enter.
 */
export function ReaderSettings({ enabled, onChanged }: { enabled: boolean; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [value, setValue] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const started = useRef(0)
  const last = useRef(0)

  async function toggle(next: boolean) {
    setBusy(true)
    setError("")
    try {
      await saveSettingsHardwareReader(next)
      setReaderEnabled(next)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  const fast = result ? result.perChar < 50 : false
  const verdict = !result
    ? null
    : result.enter && fast
      ? { ok: true, text: "✓ El lector funciona correctamente. Ya puedes usar el botón «Lector» junto a «Cámara»." }
      : !result.enter
        ? { ok: false, text: "El lector no envió Enter al final. Configúralo con sufijo «Enter» (CR) escaneando ese código en el manual del lector." }
        : { ok: false, text: "Se leyó despacio, como escrito a mano. Si fue el lector, revisa que esté en modo teclado (HID) y vuelve a probar." }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" checked={enabled} disabled={busy} onChange={(event) => void toggle(event.target.checked)} />
          <span>
            <span className="block font-medium text-[var(--pf-navy)]">Activar lector de código</span>
            <span className="block text-xs text-slate-500">
              Aparece el botón verde <b>Lector</b> a la derecha de <b>Cámara</b> en Caja, productos, conteo y mermas.
            </span>
          </span>
        </label>
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="rounded-xl border border-slate-200 p-3 text-sm">
          <p className="font-semibold text-[var(--pf-navy)]">Cómo vincular el lector</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-600">
            <li>
              <b>USB:</b> conéctalo a la PC. No necesita instalar nada.
            </li>
            <li>
              <b>Bluetooth:</b> enciéndelo en modo emparejar (ver manual) y vincúlalo desde los ajustes de Bluetooth de Windows o del celular, como un teclado.
            </li>
            <li>El lector debe estar en modo <b>teclado (HID)</b> y con sufijo <b>Enter</b>; casi todos vienen así de fábrica.</li>
            <li>Activa la casilla de arriba y haz la prueba de la derecha.</li>
          </ol>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
        <p className="font-semibold text-emerald-900">Probar el lector</p>
        <p className="text-xs text-slate-600">Toca el campo y pasa cualquier código de barras por el lector (por ejemplo, el de un producto).</p>
        <input
          value={value}
          onChange={(event) => {
            const now = performance.now()
            if (!value) started.current = now
            last.current = now
            setValue(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            const code = value.trim()
            if (!code) return
            const ms = Math.round(last.current - started.current)
            setResult({ code, ms, perChar: code.length > 1 ? ms / (code.length - 1) : 0, enter: true })
            setValue("")
            playScanPit()
          }}
          onBlur={() => {
            // Sin Enter: el lector no envía el sufijo.
            const code = value.trim()
            if (code) {
              const ms = Math.round(last.current - started.current)
              setResult({ code, ms, perChar: code.length > 1 ? ms / (code.length - 1) : 0, enter: false })
              setValue("")
            }
          }}
          placeholder="Toca aquí y escanea…"
          autoComplete="off"
          className="h-12 w-full rounded-xl border border-emerald-300 bg-white px-3 text-center font-mono outline-none focus:ring-2 focus:ring-emerald-300"
        />
        {result ? (
          <div className="space-y-2">
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white px-2 py-1.5">
                <dt className="text-[10px] text-slate-500">Código leído</dt>
                <dd className="truncate font-mono font-semibold text-slate-800">{result.code}</dd>
              </div>
              <div className="rounded-lg bg-white px-2 py-1.5">
                <dt className="text-[10px] text-slate-500">Tiempo</dt>
                <dd className="font-semibold text-slate-800">{result.ms} ms</dd>
              </div>
              <div className="rounded-lg bg-white px-2 py-1.5">
                <dt className="text-[10px] text-slate-500">Enter al final</dt>
                <dd className={`font-semibold ${result.enter ? "text-emerald-700" : "text-red-600"}`}>{result.enter ? "Sí" : "No"}</dd>
              </div>
            </dl>
            {verdict ? (
              <p className={`rounded-xl px-3 py-2 text-sm font-medium ${verdict.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{verdict.text}</p>
            ) : null}
            {!enabled && verdict?.ok ? <p className="text-xs text-amber-800">Falta activar la casilla «Activar lector de código».</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
