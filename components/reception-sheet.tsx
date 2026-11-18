"use client";

import { createPurchaseAction } from "@/actions/part2";
import { SimpleForm } from "@/components/forms";
import { Field, Label, Select } from "@/components/ui";
import type { ReceptionLine } from "@/lib/requirements";
import { useMemo, useState } from "react";

type Supplier = { id: string; tradeName: string };

export function ReceptionSheet({ suppliers, lines }: { suppliers: Supplier[]; lines: ReceptionLine[] }) {
  const [key] = useState(() => crypto.randomUUID());
  const [rows, setRows] = useState(lines);
  const payload = useMemo(
    () => JSON.stringify(rows.filter((row) => Number(row.quantity) > 0).map((row) => ({ productId: row.productId, presentationId: row.presentationId, quantity: row.quantity, unitCost: row.unitCost || "0" }))),
    [rows],
  );
  return (
    <SimpleForm action={createPurchaseAction} submit="Registrar recepción">
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="fromRequirement" value="1" />
      <input type="hidden" name="receiveNow" value="on" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Proveedor</Label>
          <Select name="supplierId" required>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName}</option>)}
          </Select>
        </div>
        <div><Label>Documento</Label><Field name="documentNumber" placeholder="Factura o guía" /></div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Producto</th>
              <th className="px-3 py-3">Presentación</th>
              <th className="px-3 py-3">Cantidad de compra</th>
              <th className="px-3 py-3">Costo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.productId} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-navy">{row.name}<span className="mt-0.5 block text-xs font-normal text-slate-500">{row.unit}</span></td>
                <td className="px-3 py-2">
                  <Select
                    value={row.presentationId}
                    onChange={(event) => {
                      const next = row.presentations.find((item) => item.id === event.target.value);
                      setRows((current) => current.map((item) => item.productId === row.productId ? { ...item, presentationId: event.target.value, unitCost: next?.unitCost ?? item.unitCost } : item));
                    }}
                  >
                    {row.presentations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                </td>
                <td className="px-3 py-2"><Field value={row.quantity} onChange={(event) => setRows((current) => current.map((item) => item.productId === row.productId ? { ...item, quantity: event.target.value } : item))} /></td>
                <td className="px-3 py-2"><Field value={row.unitCost} onChange={(event) => setRows((current) => current.map((item) => item.productId === row.productId ? { ...item, unitCost: event.target.value } : item))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SimpleForm>
  );
}
