import { TransferActions, TransferForm } from "@/components/forms";
import { Forbidden, PageHeader, Table } from "@/components/ui";
import { loadCatalog } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { TRANSFER_LABEL } from "@/lib/labels";
import { formatDate, formatQty } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function TransfersPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "transfer", ctx.grants)) return <Forbidden />;
  const [products, warehouses, transfers] = await Promise.all([
    loadCatalog(ctx),
    prisma.warehouse.findMany({ where: { businessId: ctx.businessId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.stockTransfer.findMany({
      where: { businessId: ctx.businessId },
      include: { fromWarehouse: true, toWarehouse: true, user: true, lines: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Transferencias" description="Elige el almacén de origen y el destino. Al enviar sale del origen; al recibir entra al destino." />
      <TransferForm
        products={products.filter((product) => product.isActive && !product.hasVariants)}
        warehouses={warehouses}
        currentWarehouseId={ctx.warehouseId}
      />
      <Table
        columns={["Fecha", "Ruta", "Estado", "Responsable", "Detalle", ""]}
        rows={transfers.map((transfer) => ({
          key: transfer.id,
          cells: [
            formatDate(transfer.createdAt),
            `${transfer.fromWarehouse.name} → ${transfer.toWarehouse.name}`,
            TRANSFER_LABEL[transfer.status] ?? transfer.status,
            transfer.user.name,
            transfer.lines.map((line) => `${line.product.name} ${formatQty(line.quantity)}`).join(", "),
            <TransferActions key="a" id={transfer.id} status={transfer.status} />,
          ],
        }))}
      />
    </div>
  );
}
