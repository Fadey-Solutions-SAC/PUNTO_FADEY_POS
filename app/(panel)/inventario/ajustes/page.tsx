import { AdjustmentSheet } from "@/components/adjustment-sheet";
import { Card, Forbidden, PageHeader } from "@/components/ui";
import { loadCatalog } from "@/lib/catalog";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function AdjustmentsPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "adjust", ctx.grants)) return <Forbidden />;
  const products = (await loadCatalog(ctx)).filter((product) => product.isActive && !product.hasVariants);
  const rows = products
    .map((product) => {
      const base = product.presentations.find((item) => item.factorToBase === "1")
        ?? product.presentations.find((item) => item.isDefault)
        ?? product.presentations[0];
      return {
        id: product.id,
        code: product.internalCode,
        name: product.name,
        brand: product.brandName ?? "—",
        category: product.categoryName ?? "Sin categoría",
        stock: product.stock,
        unit: product.baseUnit,
        min: product.minStock,
        presentationId: base?.id ?? "",
        trackLots: product.trackLots,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return (
    <div className="space-y-4">
      <PageHeader description={`Escribe el stock que hay ahora en ${ctx.warehouseName}. La diferencia queda en el kardex.`} />
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-navy">{ctx.warehouseName}</h2>
        <AdjustmentSheet products={rows} />
      </Card>
    </div>
  );
}
