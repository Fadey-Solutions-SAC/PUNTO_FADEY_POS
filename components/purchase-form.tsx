"use client";

import { useMemo, useState } from "react";
import { createPurchaseAction } from "@/actions/part2";
import { SimpleForm } from "@/components/forms";
import { Button, Field, Label, Select } from "@/components/ui";

type Product = { id: string; name: string; presentations: { id: string; name: string }[] };
type Supplier = { id: string; tradeName: string };

export function PurchaseForm({ suppliers, products }: { suppliers: Supplier[]; products: Product[] }) {
  const [key] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState([{ productId: products[0]?.id ?? "", presentationId: products[0]?.presentations[0]?.id ?? "", quantity: "1", unitCost: "" }]);
  const payload = useMemo(() => JSON.stringify(lines), [lines]);
  return (
    <SimpleForm action={createPurchaseAction} submit="Registrar compra">
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="lines" value={payload} />
      <div>
        <Label>Proveedor</Label>
        <Select name="supplierId" required>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName}</option>)}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Documento</Label><Field name="documentNumber" placeholder="Factura o guía" /></div>
        <div><Label>Notas</Label><Field name="notes" /></div>
        <div><Label>Descuento</Label><Field name="discount" defaultValue="0" /></div>
        <div><Label>Impuesto</Label><Field name="tax" defaultValue="0" /></div>
        <div><Label>Pago ahora</Label><Field name="payNow" defaultValue="0" /></div>
        <div>
          <Label>Medio de pago</Label>
          <Select name="payMethod" defaultValue="CASH">
            <option value="CASH">Efectivo</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="OTHER">Otro</option>
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="receiveNow" /> Recibir mercadería ahora
      </label>
      <p className="text-sm text-slate-500">Si no la recibes, la compra queda pendiente y no aumenta el stock. Lo que no pagues queda como cuenta por pagar.</p>
      <div className="space-y-3">
        {lines.map((line, index) => {
          const product = products.find((item) => item.id === line.productId) ?? products[0];
          return (
            <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-4">
              <Select value={line.productId} onChange={(event) => {
                const next = products.find((item) => item.id === event.target.value);
                setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productId: event.target.value, presentationId: next?.presentations[0]?.id ?? "" } : item));
              }}>
                {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
              <Select value={line.presentationId} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, presentationId: event.target.value } : item))}>
                {product?.presentations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
              <Field value={line.quantity} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} placeholder="Cantidad" />
              <Field value={line.unitCost} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitCost: event.target.value } : item))} placeholder="Costo" />
            </div>
          );
        })}
      </div>
      <Button type="button" variant="secondary" onClick={() => setLines((current) => [...current, { productId: products[0]?.id ?? "", presentationId: products[0]?.presentations[0]?.id ?? "", quantity: "1", unitCost: "" }])}>Otro producto</Button>
    </SimpleForm>
  );
}
