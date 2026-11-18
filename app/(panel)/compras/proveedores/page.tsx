import { saveSupplierAction } from "@/actions/part2";
import { SimpleForm } from "@/components/forms";
import { Field, Forbidden, Label, PageHeader, Table } from "@/components/ui";
import { listSuppliers } from "@/lib/purchases";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function SuppliersPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "purchases", ctx.grants)) return <Forbidden />;
  const suppliers = await listSuppliers(ctx);
  return (
    <div className="space-y-4">
      <PageHeader title="Proveedores" description="Cada proveedor pertenece solo a este negocio." />
      <SimpleForm action={saveSupplierAction} submit="Guardar proveedor">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Nombre comercial</Label><Field name="tradeName" required /></div>
          <div><Label>Razón social</Label><Field name="legalName" /></div>
          <div><Label>RUC o documento</Label><Field name="taxId" /></div>
          <div><Label>Contacto</Label><Field name="contact" /></div>
          <div><Label>Teléfono</Label><Field name="phone" /></div>
          <div><Label>Correo</Label><Field name="email" type="email" /></div>
          <div className="sm:col-span-2"><Label>Dirección</Label><Field name="address" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked /> Activo</label>
        </div>
      </SimpleForm>
      <Table
        columns={["Nombre", "Documento", "Teléfono", "Correo", "Estado"]}
        rows={suppliers.map((supplier) => ({
          key: supplier.id,
          cells: [supplier.tradeName, supplier.taxId ?? "—", supplier.phone ?? "—", supplier.email ?? "—", supplier.isActive ? "Activo" : "Inactivo"],
        }))}
      />
    </div>
  );
}
