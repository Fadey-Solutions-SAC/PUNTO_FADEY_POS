import { saveUnitAction } from "@/actions/catalog";
import { SimpleForm } from "@/components/forms";
import { Field, Label, PageHeader, Select, Table } from "@/components/ui";
import { prisma } from "@/lib/db";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

const DIMENSION: Record<string, string> = { UNIT: "Unidad", WEIGHT: "Peso", LENGTH: "Longitud", VOLUME: "Volumen" };

export const instant = false;

export default async function UnitsPage() {
  const ctx = await requireTenant();
  const rows = await prisma.unit.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } });
  const conversions = await prisma.unitConversion.findMany({
    where: { businessId: ctx.businessId },
    include: { fromUnit: true, toUnit: true },
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Unidades" description="Las conversiones permiten pasar de gramo a kilo, centímetro a metro o mililitro a litro. La caja de 12 se define como presentación del producto." />
      {can(ctx.role, "catalogWrite", ctx.grants) ? (
        <SimpleForm action={saveUnitAction} submit="Agregar unidad">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Nombre</Label><Field name="name" required /></div>
            <div><Label>Símbolo</Label><Field name="symbol" required /></div>
            <div>
              <Label>Dimensión</Label>
              <Select name="dimension" defaultValue="UNIT">
                <option value="UNIT">Unidad</option>
                <option value="WEIGHT">Peso</option>
                <option value="LENGTH">Longitud</option>
                <option value="VOLUME">Volumen</option>
              </Select>
            </div>
          </div>
        </SimpleForm>
      ) : null}
      <Table columns={["Nombre", "Símbolo", "Tipo"]} rows={rows.map((row) => ({ key: row.id, cells: [row.name, row.symbol, DIMENSION[row.dimension] ?? row.dimension] }))} />
      <Table
        columns={["Desde", "Hacia", "Factor"]}
        rows={conversions.map((row) => ({
          key: row.id,
          cells: [row.fromUnit.symbol, row.toUnit.symbol, (row.factor / 10000).toString()],
        }))}
      />
    </div>
  );
}
