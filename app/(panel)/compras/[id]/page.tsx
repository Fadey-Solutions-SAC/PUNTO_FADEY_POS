import { notFound } from "next/navigation";
import { receivePurchaseAction } from "@/actions/part2";
import { PurchaseCharge } from "@/components/purchase-charge";
import { SimpleForm } from "@/components/forms";
import { Card, Forbidden, PageHeader } from "@/components/ui";
import { PURCHASE_LABEL } from "@/lib/labels";
import { formatMoney, formatQty } from "@/lib/money";
import { getPurchase } from "@/lib/purchases";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  if (!can(ctx.role, "purchases", ctx.grants)) return <Forbidden />;
  const { id } = await params;
  const purchase = await getPurchase(ctx, id).catch(() => null);
  if (!purchase) notFound();
  const due = purchase.total - purchase.paid;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader description={`${purchase.supplier.tradeName} · ${PURCHASE_LABEL[purchase.status] ?? purchase.status} · ${purchase.warehouse.name}`} />
      <Card>
        <p className="text-sm text-slate-500">{purchase.documentNumber ?? "Sin documento"} · {purchase.user.name}</p>
        <ul className="mt-3 divide-y text-sm">
          {purchase.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 py-2">
              <span>{line.description} × {formatQty(line.quantity)} · recibido {formatQty(line.receivedBase)}</span>
              <span>{formatMoney(line.total, ctx.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between"><span>Total</span><span>{formatMoney(purchase.total, ctx.currency)}</span></div>
          <div className="flex justify-between"><span>Pagado</span><span>{formatMoney(purchase.paid, ctx.currency)}</span></div>
          <div className="flex justify-between font-semibold"><span>Por pagar</span><span>{formatMoney(due, ctx.currency)}</span></div>
        </div>
      </Card>
      {purchase.status !== "RECEIVED" && purchase.status !== "CANCELLED" ? (
        <Card>
          <h2 className="mb-3 font-medium">Recepción</h2>
          <p className="mb-3 text-sm text-slate-500">Al recibir, el inventario de este almacén aumenta según el factor de cada presentación.</p>
          <SimpleForm action={receivePurchaseAction} submit="Recibir mercadería">
            <input type="hidden" name="purchaseId" value={purchase.id} />
          </SimpleForm>
        </Card>
      ) : null}
      {due > 0 && purchase.status !== "CANCELLED" ? (
        <Card>
          <h2 className="mb-3 font-medium">Cuenta por pagar</h2>
          <PurchaseCharge purchaseId={purchase.id} amountCents={due} currency={ctx.currency} />
        </Card>
      ) : null}
    </div>
  );
}
