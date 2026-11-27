import { useEffect, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Check, Download, Eraser, Paperclip, SendHorizontal, TrendingDown, TrendingUp, X } from "lucide-react"
import { askPix, clearPix, downloadStockSheet, getPix, isOfflineError, runPixAction, sendPixFile, type PixAnswer, type PixKpi, type PixLink, type PixMessage } from "../api"

/**
 * Colores de la marca (logo Punto Fadey / Fadey Solutions): azul marino, neón azul, dorado y plateado.
 * PIX los usa fijos, sin importar el tema del panel, para que siempre se reconozca.
 */
const BRAND = {
  night: "#050b1f",
  navy: "#0a1a3f",
  blue: "#1e6fff",
  neon: "#38bdf8",
  gold: "#f5b301",
  goldSoft: "#fcd34d",
  silver: "#e2e8f0",
}

/** Avatar de PIX: círculo azul marino con anillo de neón, arco dorado (como el logo) y las letras PIX. */
export function PixAvatar({ size = 36, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={glow ? "drop-shadow-[0_0_8px_rgba(56,189,248,0.75)]" : undefined}>
      <defs>
        <radialGradient id="pix-bg" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#13306d" />
          <stop offset="100%" stopColor={BRAND.night} />
        </radialGradient>
        <linearGradient id="pix-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1a8" />
          <stop offset="50%" stopColor={BRAND.gold} />
          <stop offset="100%" stopColor="#b7791f" />
        </linearGradient>
        <linearGradient id="pix-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#a8b3c7" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#pix-bg)" stroke={BRAND.neon} strokeWidth="2.5" />
      <path d="M12 30 A21 21 0 0 1 48 15" fill="none" stroke="url(#pix-gold)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M14 48 Q32 40 52 47" fill="none" stroke={BRAND.blue} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <text x="32" y="39" textAnchor="middle" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" fontWeight="900" fontStyle="italic" fontSize="19" fill="url(#pix-silver)">
        P<tspan fill="url(#pix-gold)">I</tspan>X
      </text>
    </svg>
  )
}

/** Negritas (**texto**) e itálicas (_texto_) dentro de una línea, sin HTML. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|_(.+?)_/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index))
    if (match[1] != null) out.push(<strong key={key++} className="font-semibold text-[#0a1a3f]">{match[1]}</strong>)
    else out.push(<em key={key++} className="text-slate-500">{match[2]}</em>)
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Texto de PIX: párrafos, títulos en negrita, viñetas «- » y listas «1. ». */
function Rich({ text }: { text: string }) {
  const lines = text.split("\n")
  return (
    <div className="space-y-1 text-[13.5px] leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />
        const heading = line.match(/^\*\*([^*]+)\*\*:?$/)
        if (heading) {
          return (
            <p key={i} className="pt-1 text-[13px] font-bold tracking-wide text-[#0a1a3f]">
              {heading[1]}
            </p>
          )
        }
        const bullet = line.match(/^\s*-\s+(.*)$/)
        if (bullet) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-[#f5b301]" />
              <span className="min-w-0">{inline(bullet[1])}</span>
            </div>
          )
        }
        const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/)
        if (numbered) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#0a1a3f] text-[10px] font-bold text-[#fcd34d]">{numbered[1]}</span>
              <span className="min-w-0">{inline(numbered[2])}</span>
            </div>
          )
        }
        return <p key={i}>{inline(line)}</p>
      })}
    </div>
  )
}

const TONE: Record<NonNullable<PixKpi["tone"]>, { box: string; value: string; bar: string }> = {
  blue: { box: "from-sky-50 to-blue-50 border-sky-200", value: "text-[#1e4fd6]", bar: "bg-[#1e6fff]" },
  gold: { box: "from-amber-50 to-yellow-50 border-amber-200", value: "text-[#9a6700]", bar: "bg-[#f5b301]" },
  green: { box: "from-emerald-50 to-teal-50 border-emerald-200", value: "text-emerald-700", bar: "bg-emerald-500" },
  red: { box: "from-rose-50 to-red-50 border-rose-200", value: "text-rose-700", bar: "bg-rose-500" },
  slate: { box: "from-slate-50 to-slate-100 border-slate-200", value: "text-[#0a1a3f]", bar: "bg-slate-400" },
}

/** Tarjetas de indicadores arriba de la respuesta. */
function Kpis({ items }: { items: PixKpi[] }) {
  return (
    <div className={`mb-2.5 grid gap-1.5 ${items.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {items.map((kpi) => {
        const tone = TONE[kpi.tone ?? "slate"]
        return (
          <div key={kpi.label} className={`relative overflow-hidden rounded-xl border bg-gradient-to-br px-2.5 py-2 ${tone.box}`}>
            <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />
            <p className="truncate pl-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p className={`flex items-center gap-1 truncate pl-1 text-[15px] font-extrabold leading-tight ${tone.value}`}>
              {kpi.trend === "up" ? <TrendingUp size={14} className="shrink-0" /> : kpi.trend === "down" ? <TrendingDown size={14} className="shrink-0" /> : null}
              <span className="truncate">{kpi.value}</span>
            </p>
            {kpi.hint ? <p className="truncate pl-1 text-[10.5px] text-slate-500">{kpi.hint}</p> : null}
          </div>
        )
      })}
    </div>
  )
}

export function PixChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState("PIX")
  const [messages, setMessages] = useState<PixMessage[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    if (loaded) return
    getPix()
      .then((data) => {
        setName(data.name)
        setMessages(data.messages)
        setSuggestions(data.suggestions)
        setLoaded(true)
      })
      .catch((err) => setError(isOfflineError(err) ? "Sin conexión: PIX necesita internet para consultar los datos." : err instanceof Error ? err.message : "No se pudo abrir PIX."))
  }, [open, loaded])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy, open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function failMessage(err: unknown) {
    return isOfflineError(err) ? "Sin conexión con el servidor. Intenta de nuevo cuando vuelva la red." : err instanceof Error ? err.message : "No se pudo enviar."
  }

  function addAnswer(res: PixAnswer) {
    setMessages((list) => [...list, { id: res.id, role: "assistant", content: res.reply, links: res.links, action: res.action, kpis: res.kpis }])
    if (res.suggestions.length) setSuggestions(res.suggestions)
  }

  async function upload(file: File) {
    if (busy) return
    setError("")
    setMessages((list) => [...list, { id: `local-${Date.now()}`, role: "user", content: `📎 ${file.name}` }])
    setBusy(true)
    try {
      addAnswer(await sendPixFile(file))
    } catch (err) {
      setError(failMessage(err))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function act(message: PixMessage, cancel: boolean) {
    if (!message.action || busy) return
    const id = message.action.id
    setError("")
    // El botón desaparece al pulsarlo: cada cambio se aplica una sola vez.
    setMessages((list) => [...list.map((m) => (m.id === message.id ? { ...m, action: undefined } : m)), { id: `local-${Date.now()}`, role: "user", content: cancel ? "Cancelar" : "Aplicar cambios" }])
    setBusy(true)
    try {
      addAnswer(await runPixAction(id, cancel))
    } catch (err) {
      setError(failMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function send(question: string) {
    const value = question.trim()
    if (!value || busy) return
    setError("")
    setText("")
    setMessages((list) => [...list, { id: `local-${Date.now()}`, role: "user", content: value }])
    setBusy(true)
    try {
      addAnswer(await askPix(value))
    } catch (err) {
      setError(failMessage(err))
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  async function reset() {
    if (busy) return
    try {
      await clearPix()
      setMessages([])
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la conversación.")
    }
  }

  function go(link: PixLink) {
    if (link.download) {
      downloadStockSheet(link.href).catch((err) => setError(failMessage(err)))
      return
    }
    navigate(link.href)
    if (window.innerWidth < 1024) onClose()
  }

  if (!open) return null
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
  const showChips = !busy && (messages.length === 0 || (lastAssistant && messages[messages.length - 1] === lastAssistant))

  return (
    <>
      <button type="button" aria-label="Cerrar asistente" className="fixed inset-0 z-40 bg-[#050b1f]/50 backdrop-blur-[1px] lg:hidden" onClick={onClose} />
      <section
        role="dialog"
        aria-label={`Asistente ${name}`}
        className="fixed inset-x-0 bottom-0 top-14 z-50 flex flex-col overflow-hidden bg-[#f4f7fc] shadow-[0_20px_60px_-15px_rgba(5,11,31,0.6)] sm:inset-x-auto sm:right-3 sm:top-16 sm:bottom-3 sm:w-[26rem] sm:rounded-3xl sm:ring-1 sm:ring-[#38bdf8]/40"
      >
        {/* Encabezado con los colores de la marca */}
        <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#050b1f] via-[#0a1a3f] to-[#123a8a] px-4 pb-4 pt-3.5 text-white">
          <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden>
            <path d="M0 28 Q100 8 200 24 T400 18 V40 H0 Z" fill="#1e6fff" opacity="0.35" />
            <path d="M0 34 Q120 20 220 32 T400 28 V40 H0 Z" fill="#38bdf8" opacity="0.25" />
          </svg>
          <span className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-[#f5b301]/15 blur-2xl" aria-hidden />
          <div className="relative flex items-center gap-3">
            <PixAvatar size={44} glow />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2">
                <span className="bg-gradient-to-r from-[#fff1a8] via-[#f5b301] to-[#fcd34d] bg-clip-text text-xl font-black italic tracking-wide text-transparent">{name}</span>
                <span className="rounded-full bg-[#38bdf8]/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-[#7dd3fc] ring-1 ring-[#38bdf8]/40">IA</span>
              </p>
              <p className="truncate text-[11.5px] text-slate-300">Tu socio para hacer crecer el negocio</p>
            </div>
            <button
              type="button"
              onClick={reset}
              disabled={busy || messages.length === 0}
              className="rounded-xl p-2 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
              title="Nueva conversación"
              aria-label="Nueva conversación"
            >
              <Eraser size={16} />
            </button>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
          <p className="relative mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#fcd34d]/80">Punto Fadey · Sistema de gestión comercial</p>
        </header>

        <div ref={listRef} className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3 py-4">
          {messages.length === 0 && loaded ? (
            <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1a3f] to-[#123a8a] p-4 text-sm text-slate-200 shadow-lg ring-1 ring-[#38bdf8]/30">
              <div className="flex items-center gap-2.5">
                <PixAvatar size={34} />
                <p className="font-bold text-white">
                  ¡Hola! Soy <span className="text-[#fcd34d]">{name}</span> 👋
                </p>
              </div>
              <p className="mt-2.5 leading-relaxed">
                Miro tus ventas, stock, caja, compras y clientes, y te digo qué mejorar como un consultor de negocios. También busco en la red precios del mercado e información de tus productos, te explico cada módulo y hago cambios con tu confirmación (plantillas con el clip 📎, precios, stock mínimo).
              </p>
            </div>
          ) : null}
          {!loaded && !error ? <p className="py-8 text-center text-sm text-slate-400">Cargando…</p> : null}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-[#0a1a3f] to-[#1e4fd6] px-3.5 py-2 text-[13.5px] text-white shadow-md">{m.content}</p>
              </div>
            ) : (
              <div key={m.id} className="flex gap-2">
                <span className="mt-0.5 shrink-0">
                  <PixAvatar size={26} />
                </span>
                <div className="min-w-0 max-w-[90%] rounded-2xl rounded-tl-md border border-slate-200/80 border-l-[3px] border-l-[#f5b301] bg-white px-3.5 py-2.5 text-slate-700 shadow-sm">
                  {m.kpis?.length ? <Kpis items={m.kpis} /> : null}
                  <Rich text={m.content} />
                  {m.links?.length ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
                      {m.links.map((link) => (
                        <button
                          key={link.href + link.label}
                          type="button"
                          onClick={() => go(link)}
                          className="inline-flex items-center gap-1 rounded-full bg-[#0a1a3f] px-2.5 py-1 text-xs font-semibold text-[#fcd34d] shadow-sm hover:bg-[#123a8a]"
                        >
                          {link.download ? <Download size={12} /> : null}
                          {link.label}
                          {link.download ? null : <ArrowRight size={12} />}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {m.action ? (
                    <div className="mt-2.5 flex flex-wrap gap-2 border-t border-slate-100 pt-2.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(m, false)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#f5b301] to-[#fcd34d] px-3 py-1.5 text-xs font-bold text-[#0a1a3f] shadow hover:brightness-105 disabled:opacity-50"
                      >
                        <Check size={13} />
                        {m.action.label}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(m, true)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          )}

          {busy ? (
            <div className="flex items-center gap-2 pl-1 text-xs text-slate-500">
              <PixAvatar size={22} />
              <span className="flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-[#1e6fff] [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-[#38bdf8] [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-[#f5b301]" />
              </span>
              {name} está revisando tus datos…
            </div>
          ) : null}
          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        </div>

        {showChips && suggestions.length ? (
          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-slate-200/70 bg-white px-3 py-2 [scrollbar-width:none]">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="shrink-0 rounded-full border border-[#1e6fff]/25 bg-[#1e6fff]/5 px-3 py-1 text-xs font-medium text-[#0a1a3f] hover:border-[#f5b301] hover:bg-[#f5b301]/10"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="flex shrink-0 items-end gap-2 border-t border-slate-200/70 bg-white p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void send(text)
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:border-[#f5b301] hover:text-[#0a1a3f] disabled:opacity-40"
            title="Subir plantilla Excel (productos o stock)"
            aria-label="Subir plantilla Excel"
          >
            <Paperclip size={17} />
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void send(text)
              }
            }}
            rows={1}
            maxLength={600}
            placeholder={`Pregúntale a ${name}…`}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1e6fff] focus:bg-white"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#1e6fff] to-[#0a1a3f] text-[#fcd34d] shadow-md disabled:opacity-40"
            aria-label="Enviar"
          >
            <SendHorizontal size={17} />
          </button>
        </form>
      </section>
    </>
  )
}
