import { WarehouseBoard } from "@/components/warehouse-board";
import { WarehouseCreate } from "@/components/warehouse-create";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatQty } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function WarehousesPage() {
  const ctx = await requireTenant();
  const warehouses = await prisma.warehouse.findMany({
    where: { businessId: ctx.businessId },
    include: {
      branch: true,
      balances: {
        include: { product: { include: { category: true, brand: true, baseUnit: true } } },
      },
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  const writable = can(ctx.role, "settings", ctx.grants);
  const cards = warehouses.map((warehouse) => {
    const groups = new Map<string, { id: string; code: string; name: string; brand: string; stock: string; min: string; state: string }[]>();
    for (const balance of [...warehouse.balances].sort((a, b) => a.product.name.localeCompare(b.product.name, "es"))) {
      const category = balance.product.category?.name ?? "Sin categoría";
      const quantity = Number(formatQty(balance.quantity));
      const min = Number(formatQty(balance.product.minStock));
      const rows = groups.get(category) ?? [];
      rows.push({
        id: balance.id,
        code: balance.product.internalCode,
        name: balance.product.name,
        brand: balance.product.brand?.name ?? "—",
        stock: `${formatQty(balance.quantity)} ${balance.product.baseUnit.symbol}`,
        min: formatQty(balance.product.minStock),
        state: quantity <= 0 ? "Agotado" : min > 0 && quantity <= min ? "Bajo" : "Disponible",
      });
      groups.set(category, rows);
    }
    const categories = [...groups.keys()].sort((a, b) => {
      if (a === "Sin categoría") return 1;
      if (b === "Sin categoría") return -1;
      return a.localeCompare(b, "es");
    });
    const hasProducts = warehouse.balances.some((balance) => balance.quantity !== 0);
    return {
      id: warehouse.id,
      name: warehouse.name,
      branch: warehouse.branch.name,
      isDefault: warehouse.isDefault,
      inUse: warehouse.id === ctx.warehouseId,
      canDelete: writable && warehouses.length > 1 && !hasProducts,
      groups: categories.map((category) => ({ category, rows: groups.get(category) ?? [] })),
    };
  });
  const initialId = cards.find((warehouse) => warehouse.inUse)?.id ?? cards[0]?.id ?? "";
  return (
    <div className="space-y-4">
      <PageHeader
        description="Elige un almacén para ver sus productos."
        action={writable ? <WarehouseCreate /> : null}
      />
      <WarehouseBoard warehouses={cards} initialId={initialId} />
    </div>
  );
}
