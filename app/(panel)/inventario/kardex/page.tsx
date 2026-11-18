import { PageHeader, Table } from "@/components/ui";
import { listKardex } from "@/lib/inventory";
import { MOVE_LABEL } from "@/lib/labels";
import { formatDate, formatQty } from "@/lib/money";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function KardexPage({ searchParams }: { searchParams: Promise<{ producto?: string }> }) {
  const ctx = await requireTenant();
  const { producto } = await searchParams;
  const movements = await listKardex(ctx, producto);
  return (
    <div>
      <PageHeader title="Kardex" description="Entradas, salidas y saldo después de cada movimiento." />
      <Table
        columns={["Fecha", "Almacén", "Producto", "Tipo", "Cantidad", "Saldo", "Responsable", "Motivo"]}
        rows={movements.map((movement) => ({
          key: movement.id,
          cells: [
            formatDate(movement.createdAt),
            movement.warehouse.name,
            movement.product.name,
            MOVE_LABEL[movement.type] ?? movement.type,
            `${movement.direction === "OUT" ? "-" : "+"}${formatQty(movement.quantity)}`,
            formatQty(movement.balanceAfter),
            movement.user.name,
            movement.reason ?? "—",
          ],
        }))}
      />
    </div>
  );
}
