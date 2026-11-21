import { useState, type ChangeEvent } from "react"
import { importCatalog } from "../api"

/**
 * Importar productos desde CSV (Excel "CSV UTF-8" o el archivo exportado).
 * Primero revisa el archivo (sin guardar) y muestra qué hará o qué errores tiene.
 */
export function CatalogImport({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void | Promise<void> }) {
  const [csv, setCsv] = useState("")
  const [fileName, setFileName] = useState("")
  const [preview, setPreview] = useState<{ created: number; updated: number; errors: string[] } | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setError("")
    setPreview(null)
    setFileName(file.name)
    const text = await file.text()
    setCsv(text)
    setBusy(true)
    try {
      setPreview(await importCatalog(text, true))
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo")
    } finally {
      setBusy(false)
    }
  }

  async function onConfirm() {
    setBusy(true)
    setError("")
    try {
      const result = await importCatalog(csv, false)
      if (result.errors.length) {
        setPreview(result)
        return
      }
      await onDone(`Importación lista: ${result.created} productos nuevos y ${result.updated} actualizados.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[var(--pf-navy)]/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Importar productos"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Importar productos (CSV)</h2>
          <button type="button" className="text-sm text-slate-500" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>
            Descarga la plantilla con <b>Exportar CSV</b> (trae tus productos actuales) o arma una en Excel.
          </li>
          <li>
            Columnas mínimas: <b>nombre</b> y <b>unidad</b> (símbolo: und, kg, L…). Opcionales: código, marca, costo, precio, mayorista,
            minorista, código de barras, stock mínimo, presentación, factor.
          </li>
          <li>Guarda como “CSV UTF-8” y súbelo aquí. Un producto con el mismo código se actualiza; si no, se crea.</li>
        </ol>
        <p className="text-xs text-slate-500">El stock no se importa: entra por Inventario → Entradas o por compras.</p>

        <label className={`relative flex cursor-pointer items-center overflow-hidden justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-sm font-semibold ${busy ? "opacity-60" : "border-slate-300 text-[var(--pf-accent)] hover:bg-slate-50"}`}>
          {fileName ? `📄 ${fileName} (cambiar)` : "Elegir archivo .csv"}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e)} disabled={busy} />
        </label>

        {busy && !preview ? <p className="text-sm text-slate-500">Revisando archivo…</p> : null}
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {preview ? (
          preview.errors.length ? (
            <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-800">El archivo tiene {preview.errors.length} error{preview.errors.length === 1 ? "" : "es"}. No se guardó nada.</p>
              <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-red-700">
                {preview.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="text-xs text-red-700">Corrige el archivo y vuelve a subirlo.</p>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm text-emerald-900">
                Archivo correcto: se crearán <b>{preview.created}</b> productos y se actualizarán <b>{preview.updated}</b>.
              </p>
              <button type="button" disabled={busy} onClick={() => void onConfirm()} className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? "Importando…" : "Confirmar importación"}
              </button>
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}
