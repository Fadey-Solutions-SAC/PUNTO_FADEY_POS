import { CashArqueo } from "@/components/cash-arqueo";
import { Forbidden, PageHeader } from "@/components/ui";
import { summarizeSession, currentSession } from "@/lib/cash";
import { listPaymentMethods } from "@/lib/payment-methods";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function CloseCashPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "cashClose", ctx.grants)) return <Forbidden />;
  const session = await currentSession(ctx);
  if (!session) return <PageHeader title="Cierre" description="No hay una caja abierta." />;
  const [summary, methods] = await Promise.all([
    summarizeSession(ctx, session.id),
    listPaymentMethods(ctx),
  ]);

  const labels = Object.fromEntries(methods.map((item) => [item.code, item.label]));
  const posRows = Object.entries(summary.byMethod)
    .filter(([code, amount]) => code !== "CASH" && code !== "CREDIT" && amount > 0)
    .map(([code, expected]) => ({
      code,
      label: labels[code] ?? code,
      expected,
    }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Cierre de caja"
        description="Arqueo con conteo rápido de efectivo y confirmación de POS / otros medios."
      />
      <CashArqueo
        currency={ctx.currency}
        registerName={session.register.name}
        opening={summary.session.openingAmount}
        expectedCash={summary.expected}
        income={summary.income}
        expense={summary.expense}
        byMethod={summary.byMethod}
        posRows={posRows}
      />
    </div>
  );
}
