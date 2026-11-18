import { notFound } from "next/navigation";
import { sendDocumentAction } from "@/actions/part2";
import { AssistantEmit } from "@/components/assistant-emit";
import { AssistantPrintButton } from "@/components/assistant-print";
import { SimpleForm } from "@/components/forms";
import { readAssistantDocument } from "@/lib/billing-assistant";
import { Card, Forbidden, PageHeader } from "@/components/ui";
import { getDocument } from "@/lib/billing";
import { DOC_LABEL } from "@/lib/labels";
import { formatDate, formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  if (!can(ctx.role, "billing", ctx.grants)) return <Forbidden />;
  const { id } = await params;
  const document = await getDocument(ctx, id).catch(() => null);
  if (!document) notFound();
  const extra = await readAssistantDocument(ctx, document.id);
  const pdf = Boolean(extra?.pdfBase64);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        description={`${DOC_LABEL[document.docType] ?? document.docType} ${document.series}-${document.number} · ${DOC_LABEL[document.status] ?? document.status}`}
      />
      <Card>
        <p className="text-sm">{document.customerName}</p>
        <p className="text-sm text-slate-500">{document.customerDoc ?? "Sin documento"} · {formatDate(document.issuedAt)}</p>
        <p className="mt-3 text-lg font-semibold">{formatMoney(document.total, ctx.currency)}</p>
        <p className="mt-1 text-sm text-slate-500">Base {formatMoney(document.taxable, ctx.currency)} · IGV {formatMoney(document.tax, ctx.currency)}</p>
        {document.responseCode ? <p className="mt-2 text-sm">Código de respuesta: {document.responseCode}</p> : null}
        {document.lastError ? <p className="mt-2 text-sm text-red-700">{document.lastError}</p> : null}
        <div className="no-print mt-4 flex flex-wrap gap-2">
          <a className="rounded-lg border px-3 py-2 text-sm" href={`/api/billing/${document.id}/xml`}>XML</a>
          {document.cdrText ? <a className="rounded-lg border px-3 py-2 text-sm" href={`/api/billing/${document.id}/cdr`}>CDR</a> : null}
          <a className="rounded-lg border px-3 py-2 text-sm" href={`/facturacion/${document.id}/imprimir`}>Imprimir</a>
          {pdf ? <a className="rounded-lg border px-3 py-2 text-sm" href={`/api/billing/${document.id}/pdf`}>PDF</a> : null}
        </div>
        <AssistantPrintButton documentId={document.id} className="mt-3" />
      </Card>
      {document.status !== "ACCEPTED" ? (
        <Card>
          <h2 className="mb-2 font-medium">Envío</h2>
          <p className="mb-3 text-sm text-slate-500">Intento {document.attempts} de 5. Un reintento usa el mismo número y no crea otro comprobante.</p>
          {document.docType === "FACTURA" || document.docType === "BOLETA" ? (
            <div className="mb-4">
              <AssistantEmit documentId={document.id} />
              <p className="mt-1 text-xs text-slate-500">Usa el asistente Fadey Impresión de esta PC con tu certificado y clave SOL.</p>
            </div>
          ) : null}
          <SimpleForm action={sendDocumentAction} submit="Enviar al proveedor">
            <input type="hidden" name="documentId" value={document.id} />
          </SimpleForm>
        </Card>
      ) : null}
    </div>
  );
}
