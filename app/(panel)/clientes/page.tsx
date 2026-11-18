import { saveCustomerAction } from "@/actions/operations";
import { SimpleForm } from "@/components/forms";
import { Field, Forbidden, Label, PageHeader, Table } from "@/components/ui";
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
      <SimpleForm action={saveCustomerAction} submit="Guardar cliente">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Nombre</Label><Field name="name" required /></div>
          <div><Label>Documento</Label><Field name="document" /></div>
          <div><Label>Teléfono</Label><Field name="phone" /></div>
          <div><Label>Correo</Label><Field name="email" type="email" /></div>
          <div><Label>Dirección</Label><Field name="address" /></div>
          <div><Label>Límite de crédito</Label><Field name="creditLimit" defaultValue="0" /></div>
        </div>
      </SimpleForm>
      <Table
        columns={["Nombre", "Documento", "Teléfono", "Correo", "Deuda", "Límite"]}
        rows={customers.map((customer) => ({
          key: customer.id,
          cells: [customer.name, customer.document ?? "—", customer.phone ?? "—", customer.email ?? "—", formatMoney(customer.balance, ctx.currency), formatMoney(customer.creditLimit, ctx.currency)],
        }))}
      />
    </div>
  );
}
