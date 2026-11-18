import { Button, PageHeader, Select, Table } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";
import { Forbidden } from "@/components/ui";

export const instant = false;

export default async function CustomerHistoryPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const ctx = await requireTenant();
  if (!can(ctx.role, "customers", ctx.grants)) return <Forbidden />;
  const { cliente } = await searchParams;
  const customers = await prisma.customer.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } });
  const sales = await prisma.sale.findMany({
    where: { businessId: ctx.businessId, status: "COMPLETED", customerId: cliente || { not: null } },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Historial de clientes" />
      <form className="flex flex-wrap items-center gap-2">
        <Select name="cliente" defaultValue={cliente ?? ""} className="max-w-xs">
          <option value="">Todos</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </Select>
        <Button>Ver</Button>
      </form>
      <Table
        columns={["Fecha", "Cliente", "Tipo", "Total"]}
        rows={sales.map((sale) => ({ key: sale.id, cells: [formatDate(sale.createdAt), sale.customer?.name ?? "—", sale.saleType === "CREDIT" ? "Crédito" : "Contado", formatMoney(sale.total, ctx.currency)] }))}
      />
    </div>
  );
}
