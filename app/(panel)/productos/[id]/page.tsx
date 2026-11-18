import { ProductForm } from "@/components/product-form";
import { Forbidden, PageHeader } from "@/components/ui";
import { getProductForm } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";

export const instant = false;

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  if (!can(ctx.role, "catalogWrite", ctx.grants)) return <Forbidden />;
  const { id } = await params;
  const loaded = await getProductForm(ctx, id).catch(() => null);
  if (!loaded) notFound();
  const [categories, brands, units] = await Promise.all([
    prisma.category.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Editar producto" description={loaded.product.internalCode} />
      <ProductForm initial={loaded.values} imagePath={loaded.product.imagePath} categories={categories} brands={brands} units={units} />
    </div>
  );
}
