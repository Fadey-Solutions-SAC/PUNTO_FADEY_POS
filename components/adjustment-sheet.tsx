"use client";

import { setStockAction } from "@/actions/operations";
import { Button, ErrorText, Field, Table } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

type ProductRow = {
  id: string;
  code: string;
  name: string;
  brand: string;
  category: string;
  stock: string;
  unit: string;
  min: string;
  presentationId: string;
  trackLots: boolean;
};

function stockState(stock: string, min: string) {
  const quantity = Number(stock);
  const minimum = Number(min);
  if (quantity <= 0) return "Agotado";
  if (minimum > 0 && quantity <= minimum) return "Bajo";
  return "Disponible";
}

function AdjustmentRow({ product, reason }: { product: ProductRow; reason: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setStockAction, { error: "" });
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) router.refresh();
    wasPending.current = pending;
  }, [pending, state.error, router]);
  return (
    <form action={action} className="flex flex-nowrap items-center gap-2">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="presentationId" value={product.presentationId} />
      <input type="hidden" name="reason" value={reason} />
      <Field name="quantity" required defaultValue={product.stock} key={product.stock} className="!w-24" aria-label={`Stock contado de ${product.name}`} />
      {product.trackLots ? (
        <>
          <Field name="lotCode" placeholder="Lote" className="!w-28" aria-label={`Lote de ${product.name}`} />
          <Field name="expiresAt" type="date" className="!w-36" aria-label={`Vencimiento de ${product.name}`} />
        </>
      ) : null}
      <Button disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
      <ErrorText>{state.error}</ErrorText>
    </form>
  );
}

export function AdjustmentSheet({ products }: { products: ProductRow[] }) {
  const [reason, setReason] = useState("Conteo físico");
  const groups = new Map<string, ProductRow[]>();
  for (const product of products) {
    const rows = groups.get(product.category) ?? [];
    rows.push(product);
    groups.set(product.category, rows);
  }
  const categories = [...groups.keys()].sort((a, b) => {
    if (a === "Sin categoría") return 1;
    if (b === "Sin categoría") return -1;
    return a.localeCompare(b, "es");
  });

  if (products.length === 0) return <p className="text-sm text-slate-500">No hay productos para ajustar.</p>;

  return (
    <div className="space-y-4">
      <Field value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo" aria-label="Motivo" className="max-w-xs" />
      {categories.map((category) => (
        <div key={category}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{category}</h3>
          <Table
            columns={["Código", "Producto", "Marca", "Stock", "Mínimo", "Estado", "Contado"]}
            rows={(groups.get(category) ?? []).map((product) => ({
              key: product.id,
              cells: [
                product.code,
                product.name,
                product.brand,
                `${product.stock} ${product.unit}`,
                product.min,
                stockState(product.stock, product.min),
                <AdjustmentRow key={product.id} product={product} reason={reason.trim()} />,
              ],
            }))}
          />
        </div>
      ))}
    </div>
  );
}
