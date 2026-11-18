import { AssistantPrintButton } from "@/components/assistant-print";
import { Card } from "@/components/ui";
import { getDocument } from "@/lib/billing";
import { DOC_LABEL } from "@/lib/labels";
import { formatDate, formatMoney } from "@/lib/money";
import { requireTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";

export const instant = false;

export default async function PrintDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  const { id } = await params;
  const document = await getDocument(ctx, id).catch(() => null);
  if (!document) notFound();
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <p className="font-medium">{DOC_LABEL[document.docType] ?? document.docType} {document.series}-{document.number}</p>
        <p className="mt-2 font-medium">{document.customerName}</p>
        <p className="text-sm">{document.customerDoc ?? ""}</p>
        <p className="mt-2 text-sm">{formatDate(document.issuedAt)}</p>
        <p className="mt-3 text-sm">Estado: {DOC_LABEL[document.status] ?? document.status}</p>
        <p className="mt-2 text-lg font-semibold">{formatMoney(document.total, ctx.currency)}</p>
        <p className="mt-4 text-xs text-slate-500">Este papel no sustituye un CDR. Solo un comprobante aceptado tiene validez ante SUNAT.</p>
        <AssistantPrintButton documentId={document.id} className="mt-4" />
      </Card>
    </div>
  );
}
