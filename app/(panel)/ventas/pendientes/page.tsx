import Link from "next/link";
import { Forbidden, PageHeader, Table } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function PendingSalesPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "sell", ctx.grants)) return <Forbidden />;
  const sales = await prisma.sale.findMany({
    where: { businessId: ctx.businessId, status: "DRAFT" },
    include: { user: true, customer: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Ventas pendientes" description="Se cobran en la misma ventana de cobro. Todavía no mueven inventario ni caja." />
      <Table
        columns={["Fecha", "Cliente", "Usuario", "Total", ""]}
        rows={sales.map((sale) => ({
          key: sale.id,
          cells: [
            formatDate(sale.createdAt),
            sale.customer?.name ?? "Público",
            sale.user.name,
            formatMoney(sale.total, ctx.currency),
            <span key="a" className="flex gap-3">
              <Link href={`/ventas?draft=${sale.id}&cobro=1`}>Cobrar</Link>
              <Link href={`/ventas?draft=${sale.id}`}>Retomar</Link>
            </span>,
          ],
        }))}
      />
    </div>
  );
}
