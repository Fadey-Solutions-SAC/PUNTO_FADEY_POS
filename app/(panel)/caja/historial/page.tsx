import { Forbidden, PageHeader, Table } from "@/components/ui";
import { listSessions } from "@/lib/cash";
import { formatDate, formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function CashHistoryPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "cash", ctx.grants)) return <Forbidden />;
  const sessions = await listSessions(ctx);
  return (
    <div>
      <PageHeader title="Historial de caja" description="Cada cierre conserva el esperado, lo contado y la diferencia." />
      <Table
        columns={["Apertura", "Cierre", "Caja", "Responsable", "Estado", "Esperado", "Contado", "Diferencia"]}
        rows={sessions.map((session) => ({
          key: session.id,
          cells: [
            formatDate(session.openedAt),
            session.closedAt ? formatDate(session.closedAt) : "—",
            session.register.name,
            session.user.name,
            session.status === "OPEN" ? "Abierta" : "Cerrada",
            session.expectedAmount == null ? "—" : formatMoney(session.expectedAmount, ctx.currency),
            session.countedAmount == null ? "—" : formatMoney(session.countedAmount, ctx.currency),
            session.difference == null ? "—" : formatMoney(session.difference, ctx.currency),
          ],
        }))}
      />
    </div>
  );
}
