import { ReturnForm } from "@/components/forms";
import { Button, Card, Field, Forbidden, PageHeader } from "@/components/ui";
import { getSale } from "@/lib/sales";
import { formatQty } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ venta?: string }> }) {
  const ctx = await requireTenant();
  if (!can(ctx.role, "returnSale", ctx.grants)) return <Forbidden />;
  const { venta } = await searchParams;
  let sale = null;
  let missing = "";
  if (venta) {
    try {
      sale = await getSale(ctx, venta);
    } catch {
      missing = "No hay una venta confirmada con ese identificador en este negocio.";
    }
  }
  return (
    <div className="max-w-xl">
      <PageHeader title="Devoluciones" description="La devolución reingresa el stock y, si es en efectivo, sale de la caja abierta." />
      <Card>
        <form className="mb-4 flex gap-2">
          <Field name="venta" defaultValue={venta} placeholder="Identificador de la venta" className="flex-1" />
          <Button>Buscar</Button>
        </form>
        {missing ? <p className="text-sm text-red-700">{missing}</p> : null}
        {sale && sale.status === "COMPLETED" ? (
          <ReturnForm
            saleId={sale.id}
            credit={sale.saleType === "CREDIT"}
            lines={sale.lines.map((line) => ({
              id: line.id,
              description: line.description,
              remaining: formatQty(line.quantity - line.returnLines.reduce((sum, item) => sum + item.quantity, 0)),
            }))}
          />
        ) : null}
        {sale && sale.status !== "COMPLETED" ? <p className="text-sm text-slate-600">Esa venta no está confirmada.</p> : null}
      </Card>
    </div>
  );
}
