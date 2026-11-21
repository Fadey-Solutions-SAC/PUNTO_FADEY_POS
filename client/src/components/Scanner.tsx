import { BrowserMultiFormatReader } from "@zxing/browser"
import { BarcodeFormat } from "@zxing/library"
import { useEffect, useRef, useState, type Ref } from "react"

const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
]

export function playScanPit() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const audio = new Ctx()
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = "square"
    oscillator.frequency.value = 1400
    gain.gain.setValueAtTime(0.0001, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.09)
    oscillator.connect(gain)
    gain.connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + 0.1)
    window.setTimeout(() => void audio.close(), 250)
  } catch {
    /* noop */
  }
}

export function CodeField({
  onCode,
  placeholder = "Escanear con lector y Enter, o escribir el código",
  autoFocus = false,
  inputRef,
}: {
  onCode: (code: string) => void
  placeholder?: string
  autoFocus?: boolean
  inputRef?: Ref<HTMLInputElement>
}) {
  const [value, setValue] = useState("")
  return (
    <input
      ref={inputRef}
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return
        event.preventDefault()
        const code = event.currentTarget.value.trim()
        if (!code) return
        onCode(code)
        setValue("")
      }}
      placeholder={placeholder}
      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-[var(--pf-accent)] focus:ring-2 focus:ring-[var(--pf-accent)]/15"
    />
  )
}

// Lector de código (USB o Bluetooth): se activa en Configuración → Lector de código.
const READER_EVENT = "pf-reader-change"
let readerEnabled = false

export function setReaderEnabled(enabled: boolean) {
  readerEnabled = enabled
  window.dispatchEvent(new Event(READER_EVENT))
}

export function useReaderEnabled() {
  const [enabled, setEnabled] = useState(readerEnabled)
  useEffect(() => {
    const sync = () => setEnabled(readerEnabled)
    sync()
    window.addEventListener(READER_EVENT, sync)
    return () => window.removeEventListener(READER_EVENT, sync)
  }, [])
  return enabled
}

/**
 * Cámara y, si el lector está activado, el botón «Lector» a su derecha.
 * continuous: la ventana del lector queda abierta para pasar varios códigos (venta, conteo).
 */
export function ScannerButton({ onCode, continuous = false }: { onCode: (code: string) => void; continuous?: boolean }) {
  const [open, setOpen] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)
  const reader = useReaderEnabled()
  return (
    <>
      <button
        type="button"
        className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[var(--pf-navy)] shadow-sm"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>📷</span>
        Cámara
      </button>
      {reader ? (
        <button
          type="button"
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          onClick={() => setReaderOpen(true)}
          title="Usar el lector de código USB o Bluetooth"
        >
          <span aria-hidden>▥</span>
          Lector
        </button>
      ) : null}
      {open ? <ScannerDialog onClose={() => setOpen(false)} onCode={onCode} /> : null}
      {readerOpen ? <ReaderDialog onClose={() => setReaderOpen(false)} onCode={onCode} continuous={continuous} /> : null}
    </>
  )
}

/** Ventana que espera el código del lector (el lector «escribe» el código y pulsa Enter). */
function ReaderDialog({ onClose, onCode, continuous }: { onClose: () => void; onCode: (code: string) => void; continuous: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState("")
  const [hits, setHits] = useState<string[]>([])

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[var(--pf-navy)]/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Lector de código"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
        else event.preventDefault()
        inputRef.current?.focus()
      }}
    >
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 text-center shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Lector de código</h2>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            Cerrar <kbd className="ml-1 hidden rounded border border-slate-200 px-1 text-[10px] sm:inline">Esc</kbd>
          </button>
        </div>
        <div className="mx-auto grid size-20 place-items-center rounded-2xl bg-emerald-50 text-4xl text-emerald-600 ring-2 ring-emerald-200">
          <span className="animate-pulse" aria-hidden>▥</span>
        </div>
        <p className="text-sm font-medium text-slate-700">Pasa el código por el lector ahora</p>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => window.setTimeout(() => inputRef.current?.focus(), 0)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            const code = value.trim()
            setValue("")
            if (!code) return
            playScanPit()
            if (navigator.vibrate) navigator.vibrate(60)
            onCode(code)
            if (continuous) setHits((current) => [code, ...current].slice(0, 5))
            else onClose()
          }}
          placeholder="Esperando lectura… (o escribe el código y Enter)"
          className="h-11 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 text-center font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-300"
          autoComplete="off"
          inputMode="none"
        />
        {hits.length ? (
          <ul className="space-y-1 text-left text-xs">
            {hits.map((code, index) => (
              <li key={`${code}-${index}`} className="rounded-lg bg-emerald-50 px-2 py-1 font-mono text-emerald-800">
                ✓ {code}
              </li>
            ))}
          </ul>
        ) : null}
        {continuous ? <p className="text-xs text-slate-500">Puedes pasar varios códigos seguidos. Cierra cuando termines.</p> : null}
      </div>
    </div>
  )
}

function ScannerDialog({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState("")
  const [error, setError] = useState("")
  const [torchOn, setTorchOn] = useState(false)
  const [torchOk, setTorchOk] = useState(false)
  const [hit, setHit] = useState("")
  const [ready, setReady] = useState(true)
  const last = useRef({ code: "", at: 0 })
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let stopped = false
    let stopCamera = () => undefined as void
    const reader = new BrowserMultiFormatReader()
    reader.possibleFormats = FORMATS

    BrowserMultiFormatReader.listVideoInputDevices()
      .then(async (list) => {
        if (stopped) return
        setDevices(list)
        const preferred = list.find((item) => /back|trasera|environment|rear/i.test(item.label)) ?? list[0]
        const selected = deviceId || preferred?.deviceId
        if (!deviceId && selected) setDeviceId(selected)
        const controls = await reader.decodeFromVideoDevice(selected, video, (result) => {
          if (!result || stopped) return
          const code = result.getText().trim()
          const now = Date.now()
          if (!code || (code === last.current.code && now - last.current.at < 900)) return
          last.current = { code, at: now }
          setHit(code)
          setReady(false)
          if (navigator.vibrate) navigator.vibrate(60)
          playScanPit()
          onCodeRef.current(code)
          window.setTimeout(() => {
            if (stopped) return
            setHit("")
            setReady(true)
          }, 450)
        })
        stopCamera = () => controls.stop()
        const track = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined
        const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean }
        setTorchOk(Boolean(capabilities?.torch))
      })
      .catch(() => setError("No se pudo usar la cámara. Revisa el permiso del navegador."))

    return () => {
      stopped = true
      stopCamera()
    }
  }, [deviceId])

  async function toggleTorch() {
    const video = videoRef.current
    const track = video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined
    if (!track) return
    const next = !torchOn
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
    setTorchOn(next)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[var(--pf-navy)]">Escanear código</h2>
            <p className="text-xs text-slate-500">Lee, suma 1 unidad y sigue hasta cerrar.</p>
          </div>
          <button onClick={onClose} type="button" className="text-sm text-slate-500">
            Cerrar
          </button>
        </div>
        <video
          ref={videoRef}
          className={`aspect-video w-full rounded-xl bg-black object-cover transition ${hit ? "ring-4 ring-[var(--pf-accent)]" : ready ? "ring-2 ring-slate-200" : ""}`}
          muted
          playsInline
        />
        {hit ? (
          <p className="mt-2 text-sm font-medium text-[var(--pf-accent)]">Leído: {hit} · +1</p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{ready ? "Listo para el siguiente código…" : "Procesando…"}</p>
        )}
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {devices.length > 1 ? (
            <select
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm"
            >
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || "Cámara"}
                </option>
              ))}
            </select>
          ) : null}
          {torchOk ? (
            <button
              type="button"
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              onClick={toggleTorch}
            >
              {torchOn ? "Apagar linterna" : "Linterna"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
