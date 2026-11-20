import { useCallback, useEffect, useState } from "react"
import { backupDownloadUrl, createBackupNow, getBackups, type BackupRow } from "../api"

/** Copias de la base: crear y descargar. Las automáticas se hacen una vez al día en el servidor. */
export function BackupsPanel() {
  const [rows, setRows] = useState<BackupRow[]>([])
  const [canBackup, setCanBackup] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const load = useCallback(
    () =>
      getBackups()
        .then((data) => {
          setRows(data.backups)
          setCanBackup(data.canBackup)
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate() {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const result = await createBackupNow()
      await load()
      setMessage("Copia creada. Se descargará ahora.")
      window.location.assign(backupDownloadUrl(result.name))
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la copia")
    } finally {
      setBusy(false)
    }
  }

  if (!canBackup) {
    return <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Solo el dueño o un administrador puede sacar copias de seguridad.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
        <div className="text-sm text-slate-600">
          <p>
            Guarda <b>todo</b> el sistema: productos, stock, ventas, caja, clientes, compras, mermas y usuarios.
          </p>
          <p className="text-xs text-slate-500">El servidor también hace una copia automática cada día y guarda las últimas 7.</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onCreate()}
          className="h-11 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-900 disabled:opacity-60"
        >
          {busy ? "Creando copia…" : "Crear y descargar copia"}
        </button>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-[var(--pf-navy)]">Copias guardadas en el servidor</div>
        {loading ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">Todavía no hay copias. La primera automática se crea al minuto de iniciar el servidor.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.kind === "auto" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-700"}`}
                >
                  {row.kind === "auto" ? "Automática" : "Manual"}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-700">{row.createdAtLabel}</span>
                <span className="text-xs tabular-nums text-slate-500">{row.sizeLabel}</span>
                <a href={backupDownloadUrl(row.name)} className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--pf-accent)] hover:bg-slate-100">
                  Descargar
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="rounded-2xl border border-slate-200 p-3 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold text-[var(--pf-navy)]">¿Cómo se restaura una copia?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Guarda el archivo .db descargado en un lugar seguro (por ejemplo, Google Drive).</li>
          <li>Para restaurar, el servidor debe estar detenido y el archivo de la base se reemplaza por la copia.</li>
          <li>Pídelo al soporte de Fadey Solutions: no se hace desde esta pantalla para evitar perder ventas por error.</li>
        </ol>
      </details>
    </div>
  )
}
