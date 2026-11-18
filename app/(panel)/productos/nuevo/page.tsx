import { ProductForm } from "@/components/product-form";
import { Forbidden, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function NewProductPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "catalogWrite", ctx.grants)) return <Forbidden />;
  const [categories, brands, units] = await Promise.all([
    prisma.category.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Nuevo producto" description="El stock no se escribe aquí. Entra por inventario." />
      <ProductForm categories={categories} brands={brands} units={units} />
    </div>
  );
}
