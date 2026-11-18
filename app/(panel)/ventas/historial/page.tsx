import Link from "next/link";
import { Forbidden, PageHeader, Table } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { PAYMENT_LABEL } from "@/lib/labels";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function SalesHistoryPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "sell", ctx.grants)) return <Forbidden />;
  const sales = await prisma.sale.findMany({
    where: { businessId: ctx.businessId, status: { not: "DRAFT" } },
    include: { user: true, customer: true, payments: true },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
  return (
    <div>
      <PageHeader title="Historial de ventas" />
      <Table
        columns={["Fecha", "Estado", "Cliente", "Usuario", "Pago", "Total", ""]}
        rows={sales.map((sale) => ({
          key: sale.id,
          cells: [
            formatDate(sale.createdAt),
            sale.status === "VOIDED" ? "Anulada" : "Confirmada",
            sale.customer?.name ?? "Público",
            sale.user.name,
            sale.payments.map((payment) => PAYMENT_LABEL[payment.method] ?? payment.method).join(", "),
            formatMoney(sale.total, ctx.currency),
            <Link key="a" href={`/ventas/${sale.id}`}>Ver</Link>,
          ],
        }))}
      />
    </div>
  );
}
