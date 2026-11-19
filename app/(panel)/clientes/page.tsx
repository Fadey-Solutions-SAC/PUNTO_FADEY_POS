import { CustomersBoard } from "@/components/customers-board";
import { Forbidden, PageHeader } from "@/components/ui";
import { listCustomers } from "@/lib/customers";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function CustomersPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "customers", ctx.grants)) return <Forbidden />;
  const customers = await listCustomers(ctx);
  return (
    <div className="space-y-4">
      <PageHeader title="Clientes" />
      <CustomersBoard
        rows={customers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          document: customer.document ?? "—",
          phone: customer.phone ?? "—",
          email: customer.email ?? "—",
          debt: formatMoney(customer.balance, ctx.currency),
          limit: formatMoney(customer.creditLimit, ctx.currency),
        }))}
      />
    </div>
  );
}
