"use client";

import { prepareEmitAction, releaseEmitAction, saveEmitResultAction } from "@/actions/assistant";
import { printDocumentTicket } from "@/components/assistant-print";
import { efactReachable, emitWithLocalBot, readPrefs } from "@/lib/local-assistant";
import type { AssistantResult } from "@/lib/billing-assistant";
import { useRouter } from "next/navigation";
import { useState } from "react";

function trimResult(data: Record<string, unknown>): AssistantResult {
  const files = (data.files_base64 ?? {}) as Record<string, string | undefined>;
  return {
    ok: data.ok === true,
    mensaje: typeof data.mensaje === "string" ? data.mensaje : undefined,
    error: typeof data.error === "string" ? data.error : undefined,
    hash: typeof data.hash === "string" ? data.hash : undefined,
    codigo_qr: typeof data.codigo_qr === "string" ? data.codigo_qr : undefined,
    sunat: (data.sunat ?? null) as AssistantResult["sunat"],
    files_base64: { pdf: files.pdf, xml_firmado: files.xml_firmado, cdr_xml: files.cdr_xml },
  };
}

export async function emitDocument(documentId: string, onStatus: (message: string) => void) {
  onStatus("Buscando el asistente en esta PC…");
  if (!(await efactReachable())) throw new Error("No se encontró el asistente en esta PC. Ábrelo y vuelve a intentar.");
  onStatus("Firmando y enviando a SUNAT…");
  const prepared = await prepareEmitAction(documentId);
  if (!prepared.ok) throw new Error(prepared.error);
  let data: Record<string, unknown>;
  try {
    data = await emitWithLocalBot(prepared.sale);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "No se pudo usar el asistente";
    if (reason.includes("tardó")) await saveEmitResultAction(documentId, { ok: false, mensaje: reason });
    else await releaseEmitAction(documentId, reason);
    throw new Error(reason);
  }
  const saved = await saveEmitResultAction(documentId, trimResult(data));
  if (!saved.ok) throw new Error(saved.error);
  if (saved.status !== "ACCEPTED") throw new Error(saved.error || "El comprobante no quedó aceptado");
}

export function AssistantEmit({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function run() {
    setPending(true);
    setFailed(false);
    try {
      await emitDocument(documentId, setMessage);
      setMessage("SUNAT aceptó el comprobante");
      if (readPrefs().autoPrint) await printDocumentTicket(documentId).catch(() => undefined);
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "No se pudo emitir");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" disabled={pending} onClick={run} className="pf-button inline-flex h-10 items-center rounded-xl px-3.5 text-sm font-medium disabled:opacity-50">
        {pending ? "Emitiendo…" : "Emitir con el asistente local"}
      </button>
      {message ? <p className={`mt-2 text-sm ${failed ? "text-red-700" : "text-teal-700"}`}>{message}</p> : null}
    </div>
  );
}
