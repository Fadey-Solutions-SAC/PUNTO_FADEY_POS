"use client";

import { lookupPadronAction } from "@/actions/assistant";
import Search from "lucide-react/icons/search";
import { useState } from "react";

export type CheckoutKind = "NOTA" | "BOLETA" | "FACTURA";
export type CheckoutBuyer = { document: string; name: string; address: string };

const KINDS: { value: CheckoutKind; label: string }[] = [
  { value: "NOTA", label: "Nota de venta" },
  { value: "BOLETA", label: "Boleta" },
  { value: "FACTURA", label: "Factura" },
];

export function checkoutProblem(kind: CheckoutKind, buyer: CheckoutBuyer, total: number) {
  if (kind === "NOTA") return "";
  const document = buyer.document.replace(/\D/g, "");
  if (kind === "FACTURA") {
    if (document.length !== 11) return "La factura exige el RUC de 11 dígitos del cliente";
    if (buyer.name.trim().length < 2) return "La factura exige la razón social del cliente";
    return "";
  }
  if (document && document.length !== 8 && document.length !== 11) return "El documento debe ser DNI de 8 dígitos o RUC de 11";
  if (document && buyer.name.trim().length < 2) return "Escribe el nombre del cliente";
  if (!document && total >= 70000) return "Las boletas desde S/ 700 exigen el DNI o RUC del cliente";
  return "";
}

export function CheckoutDocument({
  kind,
  onKind,
  buyer,
  onBuyer,
  disabled = false,
}: {
  kind: CheckoutKind;
  onKind: (kind: CheckoutKind) => void;
  buyer: CheckoutBuyer;
  onBuyer: (buyer: CheckoutBuyer) => void;
  disabled?: boolean;
}) {
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState("");

  async function search() {
    setSearching(true);
    setNote("");
    const result = await lookupPadronAction(buyer.document);
    setSearching(false);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    if (kind === "FACTURA" && result.party.docType !== "6") {
      setNote("Para factura usa un RUC");
      return;
    }
    onBuyer({ document: result.party.document, name: result.party.name, address: result.party.address || buyer.address });
  }

  const field = "mt-1 h-10 w-full rounded-xl border border-slate-200 px-2 text-sm disabled:bg-slate-50";

  return (
    <div className="mt-3">
      <p className="text-sm text-slate-700">Comprobante</p>
      <div className="mt-1 grid grid-cols-3 rounded-xl bg-slate-100 p-1 text-sm">
        {KINDS.map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={disabled}
            onClick={() => { onKind(item.value); setNote(""); }}
            className={`rounded-lg px-1 py-1.5 ${kind === item.value ? "bg-white font-semibold text-navy shadow-sm" : "text-slate-500"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {kind === "NOTA" ? null : (
        <div className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3">
          <label className="block text-sm text-slate-700">{kind === "FACTURA" ? "RUC" : "DNI o RUC (opcional)"}
            <div className="mt-1 flex gap-2">
              <input
                value={buyer.document}
                disabled={disabled}
                inputMode="numeric"
                maxLength={11}
                onChange={(event) => onBuyer({ ...buyer, document: event.target.value.replace(/\D/g, "") })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void search();
                  }
                }}
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-2 text-sm disabled:bg-slate-50"
              />
              <button
                type="button"
                disabled={disabled || searching || (buyer.document.length !== 8 && buyer.document.length !== 11)}
                onClick={search}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                <Search size={15} />
                {searching ? "Buscando…" : "Buscar"}
              </button>
            </div>
          </label>
          {note ? <p className="text-xs text-amber-700">{note}</p> : <p className="text-xs text-slate-500">Buscar consulta el padrón (Decolecta). Si no hay token, escribe los datos a mano.</p>}
          <label className="block text-sm text-slate-700">{kind === "FACTURA" ? "Razón social" : "Nombre"}
            <input value={buyer.name} disabled={disabled} maxLength={200} onChange={(event) => onBuyer({ ...buyer, name: event.target.value })} className={field} />
          </label>
          <label className="block text-sm text-slate-700">Dirección
            <input value={buyer.address} disabled={disabled} maxLength={300} onChange={(event) => onBuyer({ ...buyer, address: event.target.value })} className={field} />
          </label>
        </div>
      )}
    </div>
  );
}
