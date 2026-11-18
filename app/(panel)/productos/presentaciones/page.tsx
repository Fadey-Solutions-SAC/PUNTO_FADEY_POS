import Link from "next/link";
import { ProductPhoto } from "@/components/product-photo";
import { PageHeader, Table } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatQty } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function PresentationsPage() {
  const ctx = await requireTenant();
  const rows = await prisma.presentation.findMany({
    where: { businessId: ctx.businessId, isActive: true },
    include: { product: { include: { baseUnit: true } }, unit: true },
    orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
  });
  return (
    <div>
      <PageHeader title="Presentaciones" description="Cada presentación convierte su cantidad a la unidad base del producto. La foto del producto se carga tocando el círculo." />
      <Table
        columns={["Producto", "Presentación", "Factor", "Unidad", ""]}
        rows={rows.map((row) => ({
          key: row.id,
          cells: [
            <span key="p" className="inline-flex items-center gap-2">
              <ProductPhoto
                name={row.product.name}
                imagePath={row.product.imagePath}
                productId={can(ctx.role, "catalogWrite", ctx.grants) ? row.productId : undefined}
              />
              {row.product.name}
            </span>,
            row.name,
            formatQty(row.factorToBase),
            row.unit?.symbol ?? row.product.baseUnit.symbol,
            <Link key="e" href={`/productos/${row.productId}`}>Editar</Link>,
          ],
        }))}
      />
    </div>
  );
}
