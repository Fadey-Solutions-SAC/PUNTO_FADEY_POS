"use client";

import { documentTicketAction, saleTicketAction } from "@/actions/assistant";
import { printText, readPrefs } from "@/lib/local-assistant";
import { qrDataUrl } from "@/lib/qr-image";
import Printer from "lucide-react/icons/printer";
import { useState } from "react";

export async function printSaleTicket(saleId: string) {
  const prefs = readPrefs();
  const ticket = await saleTicketAction(saleId, prefs.paperWidth);
  if (!ticket.ok) throw new Error(ticket.error);
  await printText(ticket.text, { brand: ticket.brand, logo: ticket.logo, paperWidth: prefs.paperWidth });
}

export async function printDocumentTicket(documentId: string) {
  const prefs = readPrefs();
  const ticket = await documentTicketAction(documentId, prefs.paperWidth);
  if (!ticket.ok) throw new Error(ticket.error);
  await printText(ticket.text, {
    brand: ticket.brand,
    logo: ticket.logo,
    paperWidth: prefs.paperWidth,
    qrDataUrl: ticket.qr ? qrDataUrl(ticket.qr) : undefined,
  });
}

export function AssistantPrintButton({ saleId, documentId, className = "" }: { saleId?: string; documentId?: string; className?: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function run() {
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      if (documentId) await printDocumentTicket(documentId);
      else if (saleId) await printSaleTicket(saleId);
      setMessage("Enviado a la ticketera");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "No se pudo imprimir");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`no-print ${className}`}>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={run} className="pf-button inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium disabled:opacity-50">
          <Printer size={16} />
          {pending ? "Imprimiendo…" : "Imprimir en ticketera"}
        </button>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700">
          Imprimir en esta PC
        </button>
      </div>
      {message ? <p className={`mt-2 text-sm ${failed ? "text-red-700" : "text-teal-700"}`}>{message}</p> : null}
    </div>
  );
}
