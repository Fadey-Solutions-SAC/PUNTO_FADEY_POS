import { movementAction } from "@/actions/operations";
import { SimpleForm } from "@/components/forms";
import { Field, Forbidden, Label, PageHeader, Select, Table } from "@/components/ui";
import { currentSession } from "@/lib/cash";
import { CASH_LABEL } from "@/lib/labels";
import { formatDate, formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function CashMovementsPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "cash", ctx.grants)) return <Forbidden />;
  const session = await currentSession(ctx);
  return (
    <div className="space-y-4">
      <PageHeader title="Movimientos de caja" description="Ingresos, egresos, retiros y depósitos de la caja abierta." />
      {!session ? <p className="text-sm text-slate-600">Abre una caja para registrar movimientos.</p> : (
        <>
          <SimpleForm action={movementAction} submit="Registrar">
            <div>
              <Label>Tipo</Label>
              <Select name="type" defaultValue="INCOME">
                <option value="INCOME">Ingreso</option>
                <option value="EXPENSE">Egreso</option>
                <option value="WITHDRAWAL">Retiro</option>
                <option value="DEPOSIT">Depósito</option>
              </Select>
            </div>
            <div><Label>Monto</Label><Field name="amount" required /></div>
            <div><Label>Motivo</Label><Field name="reason" required /></div>
          </SimpleForm>
          <Table
            columns={["Hora", "Tipo", "Motivo", "Monto"]}
            rows={session.movements.map((movement) => ({
              key: movement.id,
              cells: [formatDate(movement.createdAt), CASH_LABEL[movement.type] ?? movement.type, movement.reason, formatMoney(movement.amount, ctx.currency)],
            }))}
          />
        </>
      )}
    </div>
  );
}
