"use client";

import { useMemo, useState } from "react";

export function ReportTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ index: number; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const next = text ? rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(text))) : rows;
    if (!sort) return next;
    return [...next].sort((a, b) => {
      const left = a[sort.index] ?? "";
      const right = b[sort.index] ?? "";
      const result = left.localeCompare(right, "es", { numeric: true });
      return sort.dir === "asc" ? result : -result;
    });
  }, [query, rows, sort]);
  const size = 8;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * size, current * size + size);
  return (
    <div>
      <input
        value={query}
        onChange={(event) => { setQuery(event.target.value); setPage(0); }}
        placeholder="Buscar en el detalle"
        className="mb-3 h-10 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
      />
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column, index) => (
                <th key={column} className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => setSort((value) => ({ index, dir: value?.index === index && value.dir === "asc" ? "desc" : "asc" }))}
                  >
                    {column}
                    <span className="text-[10px] text-slate-400">{sort?.index === index ? (sort.dir === "asc" ? "↑" : "↓") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={columns.length}>No hay filas para mostrar.</td></tr>
            ) : visible.map((row, index) => (
              <tr key={`${current}-${index}`} className="border-t border-slate-100">
                {row.map((cell, cellIndex) => <td key={cellIndex} className={`px-3 py-2 ${cellIndex === 0 ? "" : "whitespace-nowrap"}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{filtered.length === 1 ? "1 fila" : `${filtered.length} filas`}</span>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-40" disabled={current === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Anterior</button>
          <span>{current + 1} / {pages}</span>
          <button type="button" className="rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-40" disabled={current >= pages - 1} onClick={() => setPage((value) => value + 1)}>Siguiente</button>
        </div>
      </div>
    </div>
  );
}
