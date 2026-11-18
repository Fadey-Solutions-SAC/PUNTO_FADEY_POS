import Link from "next/link";
import { Forbidden, PageHeader, Table } from "@/components/ui";
import { PURCHASE_LABEL } from "@/lib/labels";
import { formatDate, formatMoney } from "@/lib/money";
import { listPurchases } from "@/lib/purchases";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function PurchaseHistoryPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "purchases", ctx.grants)) return <Forbidden />;
  const purchases = await listPurchases(ctx);
  return (
    <div className="space-y-4">
      <PageHeader title="Historial de compras" description="Compras ya registradas. Una pendiente no mueve existencias hasta recibirla." />
      <Table
        columns={["Fecha", "Proveedor", "Documento", "Estado", "Total", "Deuda"]}
        rows={purchases.map((purchase) => ({
          key: purchase.id,
          cells: [
            formatDate(purchase.createdAt),
            <Link key="s" href={`/compras/${purchase.id}`} className="text-teal-800">{purchase.supplier.tradeName}</Link>,
            purchase.documentNumber ?? "—",
            PURCHASE_LABEL[purchase.status] ?? purchase.status,
            formatMoney(purchase.total, ctx.currency),
            formatMoney(purchase.total - purchase.paid, ctx.currency),
          ],
        }))}
      />
    </div>
  );
}
