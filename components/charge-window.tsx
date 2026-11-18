"use client";

import { Button, ErrorText } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { ReactNode } from "react";

export const CHARGE_METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "OTHER", label: "Otro" },
] as const;

export type ChargeMethod = (typeof CHARGE_METHODS)[number]["value"];

export type ChargeLine = { method: ChargeMethod; amount: string; reference: string };

export function ChargeWindow({
  total,
  currency,
  payments,
  onPayments,
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
          <select
            value={payment.method}
            onChange={(event) => onPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, method: event.target.value as ChargeMethod } : item))}
            className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm"
          >
            {CHARGE_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
          </select>
          <input
            value={payment.amount}
            onChange={(event) => onPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))}
            className="h-10 rounded-xl border border-slate-200 px-2 text-sm"
          />
        </div>
      )) : <p className="mt-2 text-sm text-slate-600">Se cargará al crédito del cliente.</p>}
      {saleType === "CASH" && allowSplit ? (
        <button type="button" className="mt-2 text-sm text-teal-800" onClick={() => onPayments([...payments, { method: "CARD", amount: "", reference: "" }])}>Agregar medio de pago</button>
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
