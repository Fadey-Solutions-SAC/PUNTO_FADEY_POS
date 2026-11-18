import { closeCashAction } from "@/actions/operations";
import { SimpleForm } from "@/components/forms";
import { Card, Field, Forbidden, Label, PageHeader } from "@/components/ui";
import { summarizeSession, currentSession } from "@/lib/cash";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function CloseCashPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "cashClose", ctx.grants)) return <Forbidden />;
  const session = await currentSession(ctx);
  if (!session) return <PageHeader title="Cierre" description="No hay una caja abierta." />;
  const summary = await summarizeSession(ctx, session.id);
  const rows = [
    ["Efectivo inicial", summary.session.openingAmount],
    ["Ventas en efectivo", summary.byMethod.CASH],
    ["Tarjetas", summary.byMethod.CARD],
    ["Transferencias", summary.byMethod.TRANSFER],
    ["Otros medios", summary.byMethod.OTHER],
    ["Crédito", summary.byMethod.CREDIT],
    ["Ingresos y depósitos", summary.income],
    ["Egresos y retiros", summary.expense],
    ["Total esperado en efectivo", summary.expected],
  ] as const;
  return (
    <div className="max-w-xl space-y-4">
      <PageHeader title="Cierre de caja" description={session.register.name} />
      <Card>
        <ul className="space-y-1 text-sm">
          {rows.map(([label, amount]) => (
            <li key={label} className="flex justify-between"><span>{label}</span><span>{formatMoney(amount, ctx.currency)}</span></li>
          ))}
        </ul>
      </Card>
      <SimpleForm action={closeCashAction} submit="Cerrar caja">
        <div><Label>Total contado</Label><Field name="counted" required /></div>
        <div><Label>Notas</Label><Field name="notes" /></div>
      </SimpleForm>
    </div>
  );
}
