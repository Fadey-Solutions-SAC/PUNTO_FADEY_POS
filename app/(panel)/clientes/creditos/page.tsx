import Link from "next/link";
import { Suspense } from "react";
import { CreditCharge } from "@/components/credit-charge";
import { Forbidden, PageHeader, Table } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { listPaymentMethods } from "@/lib/payment-methods";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function CreditsPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "customers", ctx.grants)) return <Forbidden />;
  const [sales, paymentMethods] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId: ctx.businessId, saleType: "CREDIT", status: "COMPLETED" },
      include: { customer: true, abonos: true, returns: true },
      orderBy: { createdAt: "desc" },
    }),
    listPaymentMethods(ctx),
  ]);
  const open = sales
    .map((sale) => {
      const paid = sale.abonos.reduce((sum, item) => sum + item.amount, 0);
      const returned = sale.returns.reduce((sum, item) => sum + item.total, 0);
      return { sale, due: sale.total - paid - returned };
    })
    .filter((item) => item.due > 0 && item.sale.customerId);
  return (
    <div className="space-y-4">
      <PageHeader title="Cuentas por cobrar" description="El cobro usa los métodos configurados. Solo el efectivo entra a la caja." />
      <Suspense fallback={null}>
        <CreditCharge
          currency={ctx.currency}
          methods={paymentMethods.map((method) => ({ value: method.code, label: method.label }))}
          accounts={open.flatMap(({ sale, due }) => sale.customerId ? [{ saleId: sale.id, customerId: sale.customerId, due }] : [])}
        />
      </Suspense>
      <Table
        columns={["Fecha", "Cliente", "Venta", "Saldo", ""]}
        rows={open.map(({ sale, due }) => ({
          key: sale.id,
          cells: [
            formatDate(sale.createdAt),
            sale.customer?.name ?? "—",
            <Link key="v" href={`/ventas/${sale.id}`}>Ver venta</Link>,
            formatMoney(due, ctx.currency),
            <Link key="c" href={`/clientes/creditos?cuenta=${sale.id}`}>Cobrar</Link>,
          ],
        }))}
      />
    </div>
  );
}
