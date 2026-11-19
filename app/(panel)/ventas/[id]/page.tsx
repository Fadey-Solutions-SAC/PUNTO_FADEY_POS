import Link from "next/link";
import { VoidButton } from "@/components/forms";
import { Card, PageHeader, actionLink } from "@/components/ui";
import { PAYMENT_LABEL } from "@/lib/labels";
import { formatDate, formatMoney, formatQty } from "@/lib/money";
import { can } from "@/lib/roles";
import { getSale } from "@/lib/sales";
import { requireTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";

export const instant = false;

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  const { id } = await params;
  const sale = await getSale(ctx, id).catch(() => null);
  if (!sale) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        description={`${sale.status === "VOIDED" ? "Anulada" : sale.status === "DRAFT" ? "Pendiente" : "Cobrada"} · ${formatDate(sale.createdAt)}`}
      />
      <Card>
        <p className="text-sm text-slate-500">{sale.user.name}{sale.customer ? ` · ${sale.customer.name}` : ""}</p>
        <ul className="mt-4 divide-y text-sm">
          {sale.lines.map((line) => (
            <li key={line.id} className="flex justify-between py-2">
              <span>{line.description} × {formatQty(line.quantity)}</span>
              <span>{formatMoney(line.total, ctx.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(sale.subtotal, ctx.currency)}</span></div>
          <div className="flex justify-between"><span>Descuento</span><span>{formatMoney(sale.discount, ctx.currency)}</span></div>
          <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatMoney(sale.total, ctx.currency)}</span></div>
        </div>
        <ul className="mt-3 text-sm text-slate-600">
          {sale.payments.map((payment) => (
            <li key={payment.id}>{PAYMENT_LABEL[payment.method] ?? payment.method}: {formatMoney(payment.amount, ctx.currency)}</li>
          ))}
        </ul>
        {sale.status === "VOIDED" && sale.notes ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{sale.notes}</p>
        ) : null}
        <div className="no-print mt-4 flex flex-wrap gap-2">
          {sale.status === "DRAFT" ? <Link href={`/ventas?draft=${sale.id}&cobro=1`} className={actionLink.primary}>Cobrar</Link> : null}
          {sale.status === "DRAFT" ? <Link href={`/ventas?draft=${sale.id}`} className={actionLink.secondary}>Retomar</Link> : null}
          {sale.status !== "DRAFT" ? <Link href={`/ventas/${sale.id}/ticket`} className={actionLink.secondary}>Ticket</Link> : null}
          {sale.status === "COMPLETED" ? <Link href={`/ventas/devoluciones?venta=${sale.id}`} className={actionLink.secondary}>Devolver</Link> : null}
          {sale.status === "COMPLETED" && can(ctx.role, "billing", ctx.grants) ? <Link href={`/facturacion?venta=${sale.id}`} className={actionLink.secondary}>Comprobante</Link> : null}
          {sale.status === "COMPLETED" && can(ctx.role, "voidSale", ctx.grants) ? <VoidButton saleId={sale.id} /> : null}
        </div>
      </Card>
    </div>
  );
}
