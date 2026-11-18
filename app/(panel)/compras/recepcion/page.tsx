import Link from "next/link";
import { ReceptionSheet } from "@/components/reception-sheet";
import { Forbidden, PageHeader } from "@/components/ui";
import { listSuppliers } from "@/lib/purchases";
import { receptionList } from "@/lib/requirements";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function ReceptionPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "purchases", ctx.grants)) return <Forbidden />;
  const [lines, suppliers] = await Promise.all([receptionList(ctx), listSuppliers(ctx)]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Recepción"
        description="La lista sale del requerimiento. Aquí se anota la cantidad comprada y se puede corregir si algo cambió."
      />
      {lines.length === 0 ? (
        <p className="text-sm text-slate-600">Todavía no hay una lista. Ármala en <Link href="/compras/requerimiento" className="text-teal-800">Requerimiento</Link>.</p>
      ) : suppliers.length === 0 ? (
        <p className="text-sm text-slate-600">Registra un proveedor antes de recibir la compra.</p>
      ) : (
        <ReceptionSheet suppliers={suppliers.map((supplier) => ({ id: supplier.id, tradeName: supplier.tradeName }))} lines={lines} />
      )}
    </div>
  );
}
