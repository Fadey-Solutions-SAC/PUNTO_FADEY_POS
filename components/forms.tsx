"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { receiveTransferAction, cancelTransferAction, transferAction } from "@/actions/operations";
import { returnSaleAction, voidSaleAction } from "@/actions/sales";
import { CodeField, ScannerButton } from "@/components/scanner";
import { Button, ErrorText, Field, Label, Select } from "@/components/ui";

export function SimpleForm({
  action,
  children,
  submit,
  encType,
}: {
  action: (prev: { error: string }, formData: FormData) => Promise<{ error: string }>;
  children: ReactNode;
  submit: string;
  encType?: "multipart/form-data";
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) router.refresh();
    wasPending.current = pending;
  }, [pending, state.error, router]);
  return (
    <form action={formAction} className="space-y-3" encType={encType}>
      {children}
      <ErrorText>{state.error}</ErrorText>
      <Button disabled={pending}>{pending ? "Guardando…" : submit}</Button>
    </form>
  );
}

type StockProduct = {
  id: string;
  name: string;
  trackLots: boolean;
  barcodes: { code: string; presentationId: string }[];
  presentations: { id: string; name: string; isDefault: boolean }[];
};

export function StockForm({
  products,
  action,
  typeField,
  direction,
}: {
  products: StockProduct[];
  action: (prev: { error: string }, formData: FormData) => Promise<{ error: string }>;
  typeField?: { name: string; label: string; options: { value: string; label: string }[] };
  direction?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [note, setNote] = useState("");
  const product = products.find((item) => item.id === productId);
  function onCode(code: string) {
    const found = products.find((item) => item.barcodes.some((barcode) => barcode.code === code));
    if (!found) setNote("Código no registrado");
    else {
      setProductId(found.id);
      setNote(found.name);
    }
  }
  return (
    <form action={formAction} className="max-w-xl space-y-3">
      <div className="flex gap-2">
        <CodeField onCode={onCode} />
        <ScannerButton onCode={onCode} />
      </div>
      {note ? <p className="text-sm text-slate-600">{note}</p> : null}
      <div>
        <Label>Producto</Label>
        <Select name="productId" value={productId} onChange={(event) => setProductId(event.target.value)}>
          {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </div>
      <div>
        <Label>Presentación</Label>
        <Select key={productId} name="presentationId" defaultValue={product?.presentations.find((item) => item.isDefault)?.id ?? product?.presentations[0]?.id}>
          {product?.presentations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </div>
      <div>
        <Label>Cantidad</Label>
        <Field name="quantity" required defaultValue="1" />
      </div>
      {typeField ? (
        <div>
          <Label>{typeField.label}</Label>
          <Select name={typeField.name} defaultValue={typeField.options[0]?.value}>
            {typeField.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </div>
      ) : null}
      {direction ? (
        <div>
          <Label>Dirección</Label>
          <Select name="direction" defaultValue="IN">
            <option value="IN">Aumentar</option>
            <option value="OUT">Disminuir</option>
          </Select>
        </div>
      ) : null}
      {product?.trackLots ? (
        <>
          <div><Label>Lote</Label><Field name="lotCode" /></div>
          <div><Label>Vencimiento</Label><Field name="expiresAt" type="date" /></div>
        </>
      ) : null}
      <div><Label>Motivo</Label><Field name="reason" required /></div>
      <ErrorText>{state.error}</ErrorText>
      <Button disabled={pending || products.length === 0}>{pending ? "Registrando…" : "Registrar movimiento"}</Button>
    </form>
  );
}

export function SetStockForm({
  products,
  action,
}: {
  products: (StockProduct & { stock: string; baseUnit: string })[];
  action: (prev: { error: string }, formData: FormData) => Promise<{ error: string }>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const wasPending = useRef(false);
  const product = products.find((item) => item.id === productId);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) router.refresh();
    wasPending.current = pending;
  }, [pending, state.error, router]);
  return (
    <form action={formAction} className="max-w-xl space-y-3">
      <div>
        <Label>Producto</Label>
        <Select name="productId" value={productId} onChange={(event) => setProductId(event.target.value)}>
          {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        {product ? <p className="mt-1 text-sm text-slate-500">Stock en este almacén: {product.stock} {product.baseUnit}</p> : null}
      </div>
      <div>
        <Label>Presentación</Label>
        <Select key={productId} name="presentationId" defaultValue={product?.presentations.find((item) => item.isDefault)?.id ?? product?.presentations[0]?.id}>
          {product?.presentations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </div>
      <div>
        <Label>Stock actual</Label>
        <Field name="quantity" required defaultValue={product?.stock ?? "0"} key={`qty-${productId}`} />
      </div>
      {product?.trackLots ? (
        <>
          <div><Label>Lote</Label><Field name="lotCode" /></div>
          <div><Label>Vencimiento</Label><Field name="expiresAt" type="date" /></div>
        </>
      ) : null}
      <div><Label>Motivo</Label><Field name="reason" required placeholder="Conteo físico" /></div>
      <ErrorText>{state.error}</ErrorText>
      <Button disabled={pending || products.length === 0}>{pending ? "Guardando…" : "Guardar stock"}</Button>
    </form>
  );
}

export function TransferForm({
  products,
  warehouses,
}: {
  products: StockProduct[];
  warehouses: { id: string; name: string }[];
}) {
  const [lines, setLines] = useState<{ productId: string; quantity: string }[]>([]);
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  function add(productId: string) {
    setLines((current) => current.some((line) => line.productId === productId) ? current : [...current, { productId, quantity: "1" }]);
  }
  function onCode(code: string) {
    const found = products.find((item) => item.barcodes.some((barcode) => barcode.code === code));
    if (!found) setError("Código no registrado");
    else {
      setError("");
      add(found.id);
    }
  }
  async function submit() {
    setPending(true);
    const result = await transferAction({ toWarehouseId, notes, lines });
    setPending(false);
    if (!result.ok) setError(result.error);
    else {
      setLines([]);
      setError("");
      window.location.reload();
    }
  }
  return (
    <div className="max-w-xl space-y-3">
      <div className="flex gap-2"><CodeField onCode={onCode} /><ScannerButton onCode={onCode} /></div>
      <div>
        <Label>Destino</Label>
        <Select value={toWarehouseId} onChange={(event) => setToWarehouseId(event.target.value)}>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
        </Select>
      </div>
      <div>
        <Label>Producto</Label>
        <Select defaultValue="" onChange={(event) => { if (event.target.value) add(event.target.value); }}>
          <option value="">Agregar…</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </Select>
      </div>
      {lines.map((line) => (
        <div key={line.productId} className="flex items-center gap-2">
          <span className="flex-1 text-sm">{products.find((product) => product.id === line.productId)?.name}</span>
          <Field className="w-24" value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: event.target.value } : item))} />
        </div>
      ))}
      <Field value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Nota" />
      <ErrorText>{error}</ErrorText>
      <Button type="button" disabled={pending || lines.length === 0} onClick={submit}>{pending ? "Enviando…" : "Enviar transferencia"}</Button>
    </div>
  );
}

export function TransferActions({ id, status }: { id: string; status: string }) {
  const [error, setError] = useState("");
  if (status !== "SENT") return null;
  return (
    <div className="flex gap-2">
      <Button type="button" onClick={async () => {
        const result = await receiveTransferAction(id);
        if (!result.ok) setError(result.error);
        else window.location.reload();
      }}>Recibir</Button>
      <Button type="button" variant="secondary" onClick={async () => {
        const result = await cancelTransferAction(id);
        if (!result.ok) setError(result.error);
        else window.location.reload();
      }}>Anular</Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export function VoidButton({ saleId }: { saleId: string }) {
  const [error, setError] = useState("");
  return (
    <div>
      <Button type="button" variant="danger" onClick={async () => {
        const result = await voidSaleAction(saleId);
        if (!result.ok) setError(result.error);
        else window.location.reload();
      }}>Anular venta</Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export function ReturnForm({
  saleId,
  lines,
  credit,
}: {
  saleId: string;
  credit: boolean;
  lines: { id: string; description: string; remaining: string }[];
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<"CASH" | "CREDIT">(credit ? "CREDIT" : "CASH");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-3">
      {lines.map((line) => (
        <label key={line.id} className="block text-sm">
          {line.description} · pendiente {line.remaining}
          <Field className="mt-1" value={quantities[line.id] ?? ""} placeholder="0" onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} />
        </label>
      ))}
      <Select value={method} onChange={(event) => setMethod(event.target.value as "CASH" | "CREDIT")}>
        <option value="CASH">Devolver efectivo</option>
        {credit ? <option value="CREDIT">Descontar del crédito</option> : null}
      </Select>
      <ErrorText>{error}</ErrorText>
      <Button type="button" disabled={pending} onClick={async () => {
        setPending(true);
        const result = await returnSaleAction({
          saleId,
          refundMethod: method,
          lines: Object.entries(quantities).filter(([, quantity]) => quantity && quantity !== "0").map(([saleLineId, quantity]) => ({ saleLineId, quantity })),
        });
        setPending(false);
        if (!result.ok) setError(result.error);
        else window.location.href = "/ventas/historial";
      }}>{pending ? "Registrando…" : "Registrar devolución"}</Button>
    </div>
  );
}
