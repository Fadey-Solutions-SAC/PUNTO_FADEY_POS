import { BarcodeLink } from "@/components/barcode-link";
import { PageHeader, Table } from "@/components/ui";
import { prisma } from "@/lib/db";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function BarcodesPage() {
  const ctx = await requireTenant();
  const [codes, products] = await Promise.all([
    prisma.productBarcode.findMany({
      where: { businessId: ctx.businessId },
      include: { product: true },
      orderBy: { code: "asc" },
    }),
    prisma.product.findMany({ where: { businessId: ctx.businessId, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Códigos de barras" description="Elige el producto y escanea su código. Queda vinculado al instante." />
      {can(ctx.role, "catalogWrite", ctx.grants) ? <BarcodeLink products={products.map((product) => ({ id: product.id, name: product.name }))} /> : null}
      <Table columns={["Código", "Producto"]} rows={codes.map((code) => ({ key: code.id, cells: [code.code, code.product.name] }))} />
    </div>
  );
}
