import { useRef, useState } from "react"
import { FileDown, FileUp } from "lucide-react"
import { downloadProductSheet, uploadProductSheet, type ProductSheetRow } from "../api"

type Preview = { file: File; rows: ProductSheetRow[]; errors: string[]; total: number }

/**
 * Productos y marcas: «Descargar plantilla» (todos los productos + filas vacías para nuevos)
 * y «Subir plantilla» (vista previa de lo nuevo y lo modificado, luego guardar).
 */
export function ProductSheetButtons({ writable, onMessage, onError, onDone }: { writable: boolean; onMessage: (text: string) => void; onError: (text: string) => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onDownload() {
    onError("")
    setBusy(true)
    try {
      await downloadProductSheet()
      onMessage("Plantilla descargada: modifica los datos o escribe productos nuevos en las filas verdes del final, y súbela con «Subir plantilla»")
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo descargar")
    } finally {
      setBusy(false)
    }
  }

  async function onPick(file: File | undefined) {
    if (!file) return
    onError("")
    setBusy(true)
    try {
      setPreview({ file, ...(await uploadProductSheet(file, false)) })
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo leer la plantilla")
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const button = "inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold shadow-sm ring-1 disabled:opacity-50"
  return (
    <>
      <button type="button" onClick={() => void onDownload()} disabled={busy} className={`${button} bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100`}>
        <FileDown size={16} /> Descargar plantilla
      </button>
      {writable ? (
        <>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={`${button} bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100`}>
            <FileUp size={16} /> {busy ? "Leyendo…" : "Subir plantilla"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => void onPick(event.target.files?.[0])}
          />
        </>
      ) : null}
      {preview ? (
        <PreviewDialog
          preview={preview}
          onClose={() => setPreview(null)}
          onApplied={async (text, failed) => {
            setPreview(null)
            onMessage(text)
            onError(failed.length ? `No se guardaron: ${failed.join(" · ")}` : "")
            await onDone()
          }}
        />
      ) : null}
    </>
  )
}

function PreviewDialog({ preview, onClose, onApplied }: { preview: Preview; onClose: () => void; onApplied: (text: string, failed: string[]) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const created = preview.rows.filter((row) => row.kind === "new")
  const updated = preview.rows.filter((row) => row.kind === "update")

  async function onApply() {
    setBusy(true)
    setError("")
    try {
      const result = await uploadProductSheet(preview.file, true)
      await onApplied(`Plantilla aplicada: ${result.created} producto(s) nuevo(s) y ${result.updated} actualizado(s)`, result.failed)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
      setBusy(false)
    }
  }

  const cell = "border border-slate-300 px-2 py-1.5 align-top"
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[var(--pf-navy)]/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Subir plantilla de productos"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-3 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--pf-navy)]">Plantilla de productos</h2>
            <p className="text-sm text-slate-500">
              {preview.file.name} · {created.length} nuevo(s) · {updated.length} con cambios
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>

        {preview.errors.length ? (
          <div className="max-h-32 overflow-auto rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="mb-1 font-semibold">Filas que no se guardarán ({preview.errors.length}):</p>
            <ul className="list-disc pl-5">
              {preview.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          {created.length ? (
            <table className="w-full border-collapse text-left text-sm">
              <caption className="pb-1 text-left text-sm font-semibold text-emerald-700">Productos nuevos</caption>
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className={cell}>Producto</th>
                  <th className={cell}>Marca</th>
                  <th className={`${cell} text-right`}>P. compra</th>
                  <th className={`${cell} text-right`}>P. venta</th>
                  <th className={`${cell} text-right`}>Stock inicial</th>
                  <th className={cell}>Cód. barras</th>
                </tr>
              </thead>
              <tbody>
                {created.map((row) => (
                  <tr key={row.line} className="bg-emerald-50/50">
                    <td className={`${cell} font-semibold text-[var(--pf-navy)]`}>{row.name}</td>
                    <td className={cell}>{row.values.brand || "—"}</td>
                    <td className={`${cell} text-right tabular-nums`}>{row.values.cost || "0"}</td>
                    <td className={`${cell} text-right tabular-nums`}>{row.values.price || "0"}</td>
                    <td className={`${cell} text-right tabular-nums`}>{row.values.stock || "0"}</td>
                    <td className={cell}>{row.values.barcode || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {updated.length ? (
            <table className="w-full border-collapse text-left text-sm">
              <caption className="pb-1 text-left text-sm font-semibold text-amber-700">Productos con cambios</caption>
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className={`${cell} w-[35%]`}>Producto</th>
                  <th className={cell}>Cambios</th>
                </tr>
              </thead>
              <tbody>
                {updated.map((row) => (
                  <tr key={row.line}>
                    <td className={`${cell} font-semibold text-[var(--pf-navy)]`}>{row.name}</td>
                    <td className={cell}>
                      {row.changes.map((change) => (
                        <span key={change} className="block">
                          {change}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {!created.length && !updated.length ? (
            <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              No hay cambios: los datos son iguales a los del sistema. Modifica productos o escribe nuevos en las filas verdes del final.
            </p>
          ) : null}
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="button"
          onClick={() => void onApply()}
          disabled={busy || !preview.rows.length}
          className="h-12 w-full rounded-xl bg-[var(--pf-accent)] text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {busy ? "Guardando…" : `Guardar ${created.length} nuevo(s) y ${updated.length} cambio(s)`}
        </button>
      </div>
    </div>
  )
}
