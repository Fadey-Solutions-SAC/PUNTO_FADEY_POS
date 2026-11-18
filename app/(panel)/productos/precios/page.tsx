import { createPriceListAction, savePriceAction } from "@/actions/catalog";
import { SimpleForm } from "@/components/forms";
import { Field, Label, PageHeader, Select, Table } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function PricesPage() {
  const ctx = await requireTenant();
  const [lists, products] = await Promise.all([
    prisma.priceList.findMany({
      where: { businessId: ctx.businessId },
      include: { items: { include: { product: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({ where: { businessId: ctx.businessId, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Listas de precios" description="Si la lista no tiene un precio, la venta usa el precio del producto." />
      {can(ctx.role, "catalogWrite", ctx.grants) ? (
          <SimpleForm action={createPriceListAction} submit="Crear lista">
            <Field name="name" required placeholder="Nombre de la lista" />
          </SimpleForm>
      ) : null}
      {can(ctx.role, "priceWrite", ctx.grants) ? (
          <SimpleForm action={savePriceAction} submit="Guardar precio">
            <div>
              <Label>Lista</Label>
              <Select name="listId">{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</Select>
            </div>
            <div>
              <Label>Producto</Label>
              <Select name="productId">{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</Select>
            </div>
            <div><Label>Precio</Label><Field name="price" required /></div>
          </SimpleForm>
      ) : null}
      {lists.map((list) => (
        <div key={list.id}>
          <h2 className="mb-2 font-medium">{list.name}</h2>
          <Table
            columns={["Producto", "Precio"]}
            rows={list.items.map((item) => ({ key: item.id, cells: [item.product.name, formatMoney(item.price, ctx.currency)] }))}
          />
        </div>
      ))}
    </div>
  );
}
