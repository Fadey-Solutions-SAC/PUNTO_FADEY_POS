import type { ReactNode } from "react"

export type GridColumn<T> = {
  key: string
  label: string
  /** Texto para la celda y para la descarga a Excel. */
  value: (row: T) => string
  /** Contenido visual opcional (badges, enlaces). Si no hay, se muestra `value`. */
  render?: (row: T) => ReactNode
  align?: "left" | "right" | "center"
  /** Ancho mínimo en px. */
  width?: number
  /** No se exporta (p. ej. columna de acciones). */
  noExport?: boolean
  /** Permite varias líneas (textos largos). Por defecto cada celda va en una sola línea. */
  wrap?: boolean
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

/** Descarga las filas como CSV que Excel abre directo (con tildes). */
export function downloadGrid<T>(fileName: string, columns: GridColumn<T>[], rows: T[], footer?: string[]) {
  const cols = columns.filter((column) => !column.noExport)
  const lines = [cols.map((column) => csvCell(column.label)).join(";")]
  for (const row of rows) lines.push(cols.map((column) => csvCell(column.value(row))).join(";"))
  if (footer) lines.push(footer.map(csvCell).join(";"))
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${fileName}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Tabla estilo hoja de cálculo para los historiales: bordes en cada celda, encabezado fijo,
 * filas numeradas y alternadas, y fila de totales opcional.
 */
export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  empty = "Sin registros para estos filtros.",
  footer,
  maxHeight = "70vh",
  rowClass,
}: {
  columns: GridColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty?: string
  /** Celdas de la fila de totales, en el mismo orden que las columnas. */
  footer?: ReactNode[]
  maxHeight?: string
  rowClass?: (row: T) => string
}) {
  const align = (value?: "left" | "right" | "center") => (value === "right" ? "text-right" : value === "center" ? "text-center" : "text-left")
  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-10 border border-slate-300 bg-slate-200 px-2 py-1.5 text-center text-[11px] font-semibold text-slate-500">#</th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`whitespace-nowrap border border-slate-300 bg-slate-100 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 ${align(column.align)}`}
                  style={column.width ? { minWidth: column.width } : undefined}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="border border-slate-200 px-3 py-10 text-center text-sm text-slate-500">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={rowKey(row)} className={`${index % 2 ? "bg-slate-50/70" : "bg-white"} hover:bg-amber-50/60 ${rowClass?.(row) ?? ""}`}>
                  <td className="border border-slate-200 bg-slate-100/80 px-2 py-1 text-center text-[11px] tabular-nums text-slate-400">{index + 1}</td>
                  {columns.map((column) => (
                    <td key={column.key} className={`border border-slate-200 px-2 py-1 align-middle tabular-nums ${column.wrap ? "" : "whitespace-nowrap"} ${align(column.align)}`}>
                      {column.render ? column.render(row) : column.value(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {footer && rows.length > 0 ? (
            <tfoot className="sticky bottom-0">
              <tr className="bg-slate-100 font-bold text-[var(--pf-navy)]">
                <td className="border border-slate-300 px-2 py-1.5" />
                {footer.map((cell, index) => (
                  <td key={index} className={`border border-slate-300 px-2 py-1.5 tabular-nums ${align(columns[index]?.align)}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  )
}

/** Barra de filtros a la derecha del título/selector (se apila en el teléfono). */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2">{children}</div>
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-500">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  )
}

export const filterInput = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800"
