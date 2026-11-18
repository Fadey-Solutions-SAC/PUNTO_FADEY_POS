import Link from "next/link";
import { issueDocumentAction } from "@/actions/part2";
import { SimpleForm } from "@/components/forms";
import { Badge, Forbidden, Label, PageHeader, Select, Table } from "@/components/ui";
import { listDocuments } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { DOC_LABEL } from "@/lib/labels";
import { formatDate, formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ venta?: string }> }) {
  const ctx = await requireTenant();
  if (!can(ctx.role, "billing", ctx.grants)) return <Forbidden />;
  const { venta } = await searchParams;
  const documents = await listDocuments(ctx);
  const sales = await prisma.sale.findMany({
    where: { businessId: ctx.businessId, status: "COMPLETED" },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Facturación electrónica" description="Un comprobante queda en cola hasta que un proveedor autorizado devuelva un CDR. No se marca como aceptado sin esa respuesta." />
      <SimpleForm action={issueDocumentAction} submit="Generar comprobante">
        <div>
          <Label>Venta</Label>
          <Select name="saleId" defaultValue={venta ?? sales[0]?.id}>
            {sales.map((sale) => <option key={sale.id} value={sale.id}>{formatDate(sale.createdAt)} · {sale.customer?.name ?? "Público"} · {formatMoney(sale.total, ctx.currency)}</option>)}
          </Select>
        </div>
        <div>
          <Label>Comprobante</Label>
          <Select name="docType" defaultValue="BOLETA">
            <option value="BOLETA">Boleta</option>
            <option value="FACTURA">Factura</option>
            <option value="NOTA_CREDITO">Nota de crédito</option>
            <option value="NOTA_DEBITO">Nota de débito</option>
          </Select>
        </div>
        <div>
          <Label>Comprobante aceptado que modifica</Label>
          <Select name="relatedId" defaultValue="">
            <option value="">Ninguno</option>
            {documents.filter((document) => document.status === "ACCEPTED").map((document) => (
              <option key={document.id} value={document.id}>{document.series}-{document.number}</option>
            ))}
          </Select>
        </div>
      </SimpleForm>
      <Table
        columns={["Fecha", "Comprobante", "Cliente", "Estado", "Total"]}
        rows={documents.map((document) => ({
          key: document.id,
          cells: [
            formatDate(document.issuedAt),
            <Link key="d" href={`/facturacion/${document.id}`}>{DOC_LABEL[document.docType] ?? document.docType} {document.series}-{document.number}</Link>,
            document.customerName,
            <Badge tone={document.status === "ACCEPTED" ? "ok" : document.status === "REJECTED" || document.status === "ERROR" ? "danger" : "warn"}>{DOC_LABEL[document.status] ?? document.status}</Badge>,
            formatMoney(document.total, ctx.currency),
          ],
        }))}
      />
    </div>
  );
}
