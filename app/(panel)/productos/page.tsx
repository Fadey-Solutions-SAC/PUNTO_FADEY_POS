import { ImportCatalog } from "@/components/import-catalog";
import { CatalogCreate } from "@/components/catalog-create";
import { CatalogList } from "@/components/catalog-list";
import { PageHeader } from "@/components/ui";
import { loadCatalog } from "@/lib/catalog";
import { formatMoney, toMoneyInt } from "@/lib/money";
import { prisma } from "@/lib/db";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function ProductsPage() {
  const ctx = await requireTenant();
  const [products, categories] = await Promise.all([
    loadCatalog(ctx).then((rows) => rows.filter((product) => !product.parentId)),
    prisma.category.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
  ]);
  const writable = can(ctx.role, "catalogWrite", ctx.grants);
  return (
    <div>
      <PageHeader
        title="Catálogo"
        description="Productos de este negocio. Al abrir se listan todos; una categoría muestra solo los suyos."
        action={writable ? <CatalogCreate /> : null}
      />
      <CatalogList
        writable={writable}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        products={products.map((product) => ({
          id: product.id,
          code: product.internalCode,
          name: product.name,
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          brandName: product.brandName,
          price: formatMoney(toMoneyInt(product.salePrice), ctx.currency),
          stock: `${product.stock} ${product.baseUnit}`,
          active: product.isActive,
        }))}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {writable ? <ImportCatalog /> : <span />}
          <a href="/api/catalog/export" className="text-sm text-teal-800">Exportar CSV</a>
        </div>
      </CatalogList>
    </div>
  );
}
