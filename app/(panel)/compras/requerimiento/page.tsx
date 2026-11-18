import { RequirementSheet } from "@/components/requirement-sheet";
import { Forbidden, PageHeader } from "@/components/ui";
import { lowStockRequirement } from "@/lib/requirements";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function RequirementPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "purchases", ctx.grants)) return <Forbidden />;
  const products = await lowStockRequirement(ctx);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Requerimiento"
        description={`Productos con stock bajo en ${ctx.warehouseName}. La cantidad a comprar los deja en su stock máximo.`}
      />
      {products.length === 0 ? (
        <p className="text-sm text-slate-600">No hay productos con stock bajo en este almacén.</p>
      ) : (
        <RequirementSheet products={products} />
      )}
    </div>
  );
}
