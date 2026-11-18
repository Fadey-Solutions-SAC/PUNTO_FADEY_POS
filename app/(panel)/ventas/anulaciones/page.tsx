import { VoidButton } from "@/components/forms";
import { Forbidden, PageHeader, Table } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";
import Link from "next/link";

export const instant = false;

export default async function VoidsPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "voidSale", ctx.grants)) return <Forbidden />;
  const sales = await prisma.sale.findMany({
    where: { businessId: ctx.businessId, status: { in: ["COMPLETED", "VOIDED"] } },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return (
    <div>
      <PageHeader title="Anulaciones" description="Anular revierte el inventario. Si la venta ya tuvo devoluciones, no se anula." />
      <Table
        columns={["Fecha", "Estado", "Usuario", "Total", ""]}
        rows={sales.map((sale) => ({
          key: sale.id,
          cells: [
            formatDate(sale.createdAt),
            sale.status === "VOIDED" ? "Anulada" : "Confirmada",
            sale.user.name,
            formatMoney(sale.total, ctx.currency),
            sale.status === "COMPLETED" ? <VoidButton key="v" saleId={sale.id} /> : <Link key="l" href={`/ventas/${sale.id}`}>Ver</Link>,
          ],
        }))}
      />
    </div>
  );
}
