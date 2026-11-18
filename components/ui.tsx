import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const fieldClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

export const actionLink = {
  primary: "pf-button inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-medium shadow-sm transition",
  secondary: "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm transition hover:border-primary/30 hover:text-primary",
  ghost: "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-primary",
};

export function PageHeader({ description, action }: { title?: string; description?: string; action?: ReactNode }) {
  if (!description && !action) return null;
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      {description ? <p className="max-w-2xl text-sm text-slate-500">{description}</p> : <span />}
      {action}
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "pf-button shadow-sm",
    secondary: "border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-primary/30 hover:text-primary",
    danger: "bg-red-700 text-white shadow-sm hover:bg-red-800",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-medium transition disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-slate-700">{children}</label>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[var(--pf-shadow)] ${className}`}>{children}</section>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger" | "info"; children: ReactNode }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-600",
    ok: "bg-emerald-50 text-ok",
    warn: "bg-amber-50 text-warn",
    danger: "bg-red-50 text-red-700",
    info: "bg-cyan-50 text-primary",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

export function Forbidden() {
  return <p className="text-sm text-slate-600">No tienes permiso para esta operación.</p>;
}

export function Soon({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <PageHeader title={title} description={text} />
      <Card>
        <p className="text-sm text-slate-600">Este módulo queda reservado para la siguiente etapa. No hay datos simulados.</p>
      </Card>
    </div>
  );
}

export function Table({ columns, rows }: { columns: string[]; rows: { key: string; cells: ReactNode[] }[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-[var(--pf-shadow)]">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-3 py-3 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-slate-500">
                Sin registros para mostrar
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100 transition hover:bg-slate-50/80">
                {row.cells.map((cell, index) => (
                  <td key={`${row.key}-${index}`} className="whitespace-nowrap px-3 py-2.5 align-middle text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
