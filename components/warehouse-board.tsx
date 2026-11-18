"use client";

import { deleteWarehouseAction } from "@/actions/operations";
import { SimpleForm } from "@/components/forms";
import { Table } from "@/components/ui";
import { useState } from "react";

type ProductRow = {
  id: string;
  code: string;
  name: string;
  brand: string;
  stock: string;
  min: string;
  state: string;
};

type WarehouseCard = {
  id: string;
  name: string;
  branch: string;
  isDefault: boolean;
  inUse: boolean;
  canDelete: boolean;
  groups: { category: string; rows: ProductRow[] }[];
};

export function WarehouseBoard({ warehouses, initialId }: { warehouses: WarehouseCard[]; initialId: string }) {
  const [selectedId, setSelectedId] = useState(initialId);
  const selected = warehouses.find((warehouse) => warehouse.id === selectedId) ?? warehouses[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {warehouses.map((warehouse) => {
          const active = warehouse.id === selected?.id;
          const notes = [warehouse.isDefault ? "Por defecto" : "", warehouse.inUse ? "En uso" : ""].filter(Boolean).join(" · ");
          return (
            <button
              key={warehouse.id}
              type="button"
              onClick={() => setSelectedId(warehouse.id)}
              className="rounded-2xl border px-4 py-3 text-left shadow-[var(--pf-shadow)] transition"
              style={active
                ? { background: "var(--pf-button)", borderColor: "transparent", color: "var(--pf-button-ink)" }
                : { background: "white", borderColor: "var(--pf-line, #e2e8f0)", color: "var(--color-navy, #0c2340)" }}
            >
              <span className="block text-base font-semibold">{warehouse.name}</span>
              {notes ? <span className="mt-1 block text-xs opacity-80">{notes}</span> : null}
            </button>
          );
        })}
      </div>
      {selected ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-navy">{selected.name}</h2>
            {selected.canDelete ? (
              <SimpleForm action={deleteWarehouseAction} submit="Eliminar">
                <input type="hidden" name="warehouseId" value={selected.id} />
              </SimpleForm>
            ) : null}
          </div>
          {selected.groups.length === 0 ? (
            <p className="text-sm text-slate-500">Este almacén no tiene productos.</p>
          ) : (
            selected.groups.map((group) => (
              <div key={group.category}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{group.category}</h3>
                <Table
                  columns={["Código", "Producto", "Marca", "Stock", "Mínimo", "Estado"]}
                  rows={group.rows.map((row) => ({
                    key: row.id,
                    cells: [row.code, row.name, row.brand, row.stock, row.min, row.state],
                  }))}
                />
              </div>
            ))
          )}
        </section>
      ) : null}
    </div>
  );
}
