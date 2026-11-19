"use client";

import { Button, ErrorText, fieldClass } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import ChevronDown from "lucide-react/icons/chevron-down";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export const CHARGE_METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "OTHER", label: "Otro" },
] as const;

export type ChargeMethod = string;

export type ChargeLine = { method: ChargeMethod; amount: string; reference: string };

function MethodDropdown({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((item) => item.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className={`${fieldClass} flex items-center justify-between gap-2 text-left disabled:bg-slate-50`}
      >
        <span className="truncate">{selected?.label ?? "Método"}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-[var(--pf-shadow)]"
        >
          {options.map((method) => {
            const active = method.value === value;
            return (
              <li key={method.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`flex w-full items-center px-3 py-2.5 text-left transition ${
                    active ? "bg-primary/10 font-medium text-navy" : "text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    onChange(method.value);
                    setOpen(false);
                  }}
                >
                  {method.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function ChargeWindow({
  total,
  currency,
  payments,
  onPayments,
  methods = CHARGE_METHODS.map((item) => ({ value: item.value, label: item.label })),
  allowCredit = false,
  saleType = "CASH",
  onSaleType,
  allowSplit = true,
  pending = false,
  error = "",
  status = "",
  confirmLabel = "Confirmar",
  onConfirm,
  onClose,
  children,
}: {
  total: number;
  currency: string;
  payments: ChargeLine[];
  onPayments: (payments: ChargeLine[]) => void;
  methods?: { value: string; label: string }[];
  allowCredit?: boolean;
  saleType?: "CASH" | "CREDIT";
  onSaleType?: (saleType: "CASH" | "CREDIT") => void;
  allowSplit?: boolean;
  pending?: boolean;
  error?: string;
  status?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose?: () => void;
  children?: ReactNode;
}) {
  const options = methods.length > 0 ? methods : CHARGE_METHODS.map((item) => ({ value: item.value, label: item.label }));
  const splitDefault = options.find((item) => item.value !== "CASH")?.value ?? options[0]?.value ?? "CARD";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--pf-shadow)]">
      <h3 className="font-semibold text-navy">Cobro {formatMoney(total, currency)}</h3>
      {allowCredit ? (
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm">
          <button type="button" className={`rounded-lg py-1.5 ${saleType === "CASH" ? "bg-white font-semibold text-navy shadow-sm" : "text-slate-500"}`} onClick={() => onSaleType?.("CASH")}>Contado</button>
          <button type="button" className={`rounded-lg py-1.5 ${saleType === "CREDIT" ? "bg-white font-semibold text-navy shadow-sm" : "text-slate-500"}`} onClick={() => onSaleType?.("CREDIT")}>Crédito</button>
        </div>
      ) : null}
      {children}
      {saleType === "CASH" ? payments.map((payment, index) => (
        <div key={index} className="mt-2 grid grid-cols-[1fr_6rem] gap-2">
          <MethodDropdown
            value={payment.method}
            options={options}
            disabled={pending}
            onChange={(method) => onPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, method } : item))}
          />
          <input
            value={payment.amount}
            disabled={pending}
            onChange={(event) => onPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))}
            className={`${fieldClass} disabled:bg-slate-50`}
          />
        </div>
      )) : <p className="mt-2 text-sm text-slate-600">Se cargará al crédito del cliente.</p>}
      {saleType === "CASH" && allowSplit ? (
        <button type="button" className="mt-2 text-sm text-primary" onClick={() => onPayments([...payments, { method: splitDefault, amount: "", reference: "" }])}>Agregar medio de pago</button>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" disabled={pending} onClick={onConfirm}>{pending ? status || "Cobrando…" : confirmLabel}</Button>
        {onClose ? <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Volver</Button> : null}
      </div>
      {status && !pending ? <p className="mt-2 text-sm text-teal-700">{status}</p> : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
