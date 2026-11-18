"use client";

import { saveRequirementAction } from "@/actions/part2";
import { SimpleForm } from "@/components/forms";
import { Field } from "@/components/ui";
import type { RequirementProduct } from "@/lib/requirements";
import { useMemo, useState } from "react";

export function RequirementSheet({ products }: { products: RequirementProduct[] }) {
  const [rows, setRows] = useState(products.map((product) => ({ ...product, include: product.quantity !== "" && product.quantity !== "0" })));
  const lines = useMemo(
    () => JSON.stringify(rows.filter((row) => row.include).map((row) => ({ productId: row.productId, quantity: row.quantity }))),
    [rows],
  );
  return (
    <SimpleForm action={saveRequirementAction} submit="Guardar lista">
      <input type="hidden" name="lines" value={lines} />
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3" />
              <th className="px-3 py-3">Producto</th>
              <th className="px-3 py-3">Categoría</th>
              <th className="px-3 py-3">Stock</th>
              <th className="px-3 py-3">Mínimo</th>
              <th className="px-3 py-3">Máximo</th>
              <th className="px-3 py-3">Cantidad a comprar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.productId} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(event) => setRows((current) => current.map((item) => item.productId === row.productId ? { ...item, include: event.target.checked } : item))}
                  />
                </td>
                <td className="px-3 py-2 font-medium text-navy">{row.name}</td>
                <td className="px-3 py-2 text-slate-500">{row.categoryName ?? "—"}</td>
                <td className="px-3 py-2">{row.stock} {row.unit}</td>
                <td className="px-3 py-2">{row.minStock}</td>
                <td className="px-3 py-2">{row.maxStock ?? "—"}</td>
                <td className="px-3 py-2">
                  <Field
                    value={row.quantity}
                    placeholder={row.maxStock ? row.unit : "Sin máximo"}
                    onChange={(event) => setRows((current) => current.map((item) => item.productId === row.productId ? { ...item, quantity: event.target.value, include: true } : item))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SimpleForm>
  );
}
