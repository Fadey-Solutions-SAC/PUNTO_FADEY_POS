import { PageHeader, Table } from "@/components/ui";
import { loadCatalog } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { formatQty } from "@/lib/money";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function expiryLabel(expiresAt: Date) {
  const days = Math.round((startOfDay(expiresAt).getTime() - startOfDay(new Date()).getTime()) / DAY);
  if (days < 0) return days === -1 ? "Vencido hace 1 día" : `Vencido hace ${-days} días`;
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  return `Vence en ${days} días`;
}

export default async function AlertsPage() {
  const ctx = await requireTenant();
  const horizon = startOfDay(new Date());
  horizon.setDate(horizon.getDate() + 15);
  horizon.setHours(23, 59, 59, 999);
  const [catalog, lots] = await Promise.all([
    loadCatalog(ctx),
    prisma.lot.findMany({
      where: {
        businessId: ctx.businessId,
        warehouseId: ctx.warehouseId,
        quantity: { gt: 0 },
        expiresAt: { lte: horizon },
      },
      include: { product: { select: { name: true, baseUnit: { select: { symbol: true } } } } },
      orderBy: { expiresAt: "asc" },
    }),
  ]);
  const products = catalog.filter((product) => product.isActive && !product.hasVariants);
  const alerts = products.filter((product) => {
    const quantity = Number(product.stock);
    const min = Number(product.minStock);
    return quantity <= 0 || (min > 0 && quantity <= min);
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Alertas" description={`Almacén ${ctx.warehouseName}. Stock bajo y lotes que vencen dentro de 15 días.`} />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-navy">Por vencer</h2>
        {lots.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Ningún lote vence en los próximos 15 días.</p>
        ) : (
          <Table
            columns={["Producto", "Lote", "Cantidad", "Vencimiento", "Aviso"]}
            rows={lots.map((lot) => ({
              key: lot.id,
              cells: [
                lot.product.name,
                lot.code,
                `${formatQty(lot.quantity)} ${lot.product.baseUnit.symbol}`,
                lot.expiresAt ? lot.expiresAt.toLocaleDateString("es-PE") : "—",
                lot.expiresAt ? expiryLabel(lot.expiresAt) : "—",
              ],
            }))}
          />
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-navy">Stock</h2>
        <Table
          columns={["Producto", "Stock", "Mínimo", "Alerta"]}
          rows={alerts.map((product) => ({
            key: product.id,
            cells: [product.name, `${product.stock} ${product.baseUnit}`, product.minStock, Number(product.stock) <= 0 ? "Agotado" : "Stock bajo"],
          }))}
        />
      </section>
    </div>
  );
}
