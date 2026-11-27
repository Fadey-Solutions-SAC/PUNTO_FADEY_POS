import { useEffect, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Check, Download, Eraser, Paperclip, SendHorizontal, Sparkles, X } from "lucide-react"
import { askPix, clearPix, downloadStockSheet, getPix, isOfflineError, runPixAction, sendPixFile, type PixAnswer, type PixLink, type PixMessage } from "../api"

/** Negritas (**texto**) e itálicas (_texto_) dentro de una línea, sin HTML. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|_(.+?)_/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index))
    if (match[1] != null) out.push(<strong key={key++} className="font-semibold text-slate-900">{match[1]}</strong>)
    else out.push(<em key={key++} className="text-slate-500">{match[2]}</em>)
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Texto de PIX: párrafos, viñetas «- » y listas «1. ». */
function Rich({ text }: { text: string }) {
  const lines = text.split("\n")
  return (
    <div className="space-y-1 text-[13.5px] leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />
        const bullet = line.match(/^\s*-\s+(.*)$/)
        if (bullet) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-[var(--pf-accent)]" />
              <span className="min-w-0">{inline(bullet[1])}</span>
            </div>
          )
        }
        const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/)
        if (numbered) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-[var(--pf-accent)]">{numbered[1]}.</span>
              <span className="min-w-0">{inline(numbered[2])}</span>
            </div>
          )
        }
        return <p key={i}>{inline(line)}</p>
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
    setMessages((list) => [...list, { id: res.id, role: "assistant", content: res.reply, links: res.links, action: res.action }])
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
      <button type="button" aria-label="Cerrar asistente" className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={onClose} />
      <section
        role="dialog"
        aria-label={`Asistente ${name}`}
        className="fixed inset-x-0 bottom-0 top-14 z-50 flex flex-col bg-white shadow-2xl sm:inset-x-auto sm:right-3 sm:top-16 sm:bottom-3 sm:w-[25rem] sm:rounded-2xl sm:border sm:border-slate-200"
      >
        <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--pf-accent)] text-white shadow-sm">
            <Sparkles size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--pf-navy)]">{name}</p>
            <p className="truncate text-[11px] text-slate-500">Asistente de Punto Fadey · datos de tu negocio</p>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={busy || messages.length === 0}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            title="Nueva conversación"
            aria-label="Nueva conversación"
          >
            <Eraser size={16} />
          </button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 px-3 py-4">
          {messages.length === 0 && loaded ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <p className="font-semibold text-[var(--pf-navy)]">Hola, soy {name}.</p>
              <p className="mt-1">
                Pregúntame por tus ventas, stock, vencimientos, caja, compras o clientes; cómo se usa cada módulo; o precios de referencia en supermercados y datos de un producto por su código de barras. También hago cambios con tu confirmación: pídeme la plantilla de productos o de stock y súbela con el clip 📎, o dime «cambia el precio de arroz a 3.50».
              </p>
            </div>
          ) : null}
          {!loaded && !error ? <p className="py-8 text-center text-sm text-slate-400">Cargando…</p> : null}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--pf-navy)] px-3.5 py-2 text-[13.5px] text-white">{m.content}</p>
              </div>
            ) : (
              <div key={m.id} className="flex gap-2">
                <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--pf-accent)]/15 text-[var(--pf-accent)]">
                  <Sparkles size={12} />
                </span>
                <div className="min-w-0 max-w-[88%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3.5 py-2.5 text-slate-700 shadow-sm">
                  <Rich text={m.content} />
                  {m.links?.length ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
                      {m.links.map((link) => (
                        <button
                          key={link.href + link.label}
                          type="button"
                          onClick={() => go(link)}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-[var(--pf-navy)] hover:bg-slate-200"
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
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Check size={13} />
                        {m.action.label}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(m, true)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
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
            <div className="flex items-center gap-2 pl-8 text-xs text-slate-400">
              <span className="flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-slate-400" />
              </span>
              {name} está consultando…
            </div>
          ) : null}
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        </div>

        {showChips && suggestions.length ? (
          <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 bg-white px-3 py-2 [scrollbar-width:none]">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-[var(--pf-accent)] hover:text-[var(--pf-navy)]"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="flex items-end gap-2 border-t border-slate-100 bg-white p-3 sm:rounded-b-2xl"
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
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-[var(--pf-navy)] disabled:opacity-40"
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
            placeholder="Escribe tu pregunta…"
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--pf-accent)]"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--pf-accent)] text-white disabled:opacity-40"
            aria-label="Enviar"
          >
            <SendHorizontal size={17} />
          </button>
        </form>
      </section>
    </>
  )
}
