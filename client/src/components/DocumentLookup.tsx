import { useState } from "react"
import { lookupDocument } from "../api"

/** Botón "Buscar" junto a un DNI (8) o RUC (11): trae nombre/razón social y dirección. */
export function DocumentLookup({
  value,
  onFound,
}: {
  value: string
  onFound: (party: { document: string; name: string; address: string; docType: "1" | "6" }) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const digits = value.replace(/\D/g, "")
  const ready = digits.length === 8 || digits.length === 11

  async function onClick() {
    setBusy(true)
    setError("")
    try {
      onFound(await lookupDocument(digits))
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se encontró")
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="flex flex-col">
      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => void onClick()}
        title={ready ? "Buscar en RENIEC / SUNAT" : "Escribe un DNI de 8 dígitos o un RUC de 11"}
        className="mt-1 h-[2.6rem] shrink-0 rounded-xl bg-sky-500 px-3 text-xs font-semibold text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400"
      >
        {busy ? "…" : "Buscar"}
      </button>
      {error ? <span className="mt-1 max-w-[12rem] text-[11px] leading-tight text-red-700">{error}</span> : null}
    </span>
  )
}
