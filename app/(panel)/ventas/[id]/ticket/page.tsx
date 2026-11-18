import { AssistantPrintButton } from "@/components/assistant-print";
import { formatDate, formatMoney, formatQty } from "@/lib/money";
import { PAYMENT_LABEL } from "@/lib/labels";
import { getSale } from "@/lib/sales";
import { requireTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";

export const instant = false;

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  const { id } = await params;
  const sale = await getSale(ctx, id).catch(() => null);
  if (!sale || sale.status === "DRAFT") notFound();
  return (
    <div className="mx-auto max-w-xs bg-white p-4 text-sm">
      <p className="text-center text-base font-semibold">{ctx.businessName}</p>
      <p className="text-center text-slate-500">{formatDate(sale.createdAt)}</p>
      <p className="text-center text-slate-500">{sale.user.name}</p>
      <ul className="mt-4 space-y-2">
        {sale.lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-3">
            <span>{line.description} × {formatQty(line.quantity)}</span>
            <span>{formatMoney(line.total, ctx.currency)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t pt-2">
        <div className="flex justify-between font-semibold"><span>Total</span><span>{formatMoney(sale.total, ctx.currency)}</span></div>
        {sale.payments.map((payment) => (
          <div key={payment.id} className="flex justify-between text-slate-600">
            <span>{PAYMENT_LABEL[payment.method] ?? payment.method}</span>
            <span>{formatMoney(payment.amount, ctx.currency)}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">{sale.status === "VOIDED" ? "ANULADA" : "Gracias por su compra"}</p>
      <AssistantPrintButton saleId={sale.id} className="mt-4" />
    </div>
  );
}
