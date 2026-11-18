"use client";

import { addBarcodeAction } from "@/actions/catalog";
import { CodeField, ScannerButton } from "@/components/scanner";
import { ErrorText, Label, Select } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function BarcodeLink({ products }: { products: { id: string; name: string }[] }) {
  const router = useRouter();
  const fieldRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [productId, setProductId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [linked, setLinked] = useState("");

  async function link(code: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      setLinked("");
      setError("Elige el producto y vuelve a escanear");
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setLinked("");
    const data = new FormData();
    data.set("productId", product.id);
    data.set("code", code);
    try {
      const result = await addBarcodeAction({ error: "" }, data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLinked(`${code} quedó vinculado a ${product.name}`);
      router.refresh();
    } finally {
      busy.current = false;
      setPending(false);
      fieldRef.current?.focus();
    }
  }

  return (
    <div className="max-w-xl space-y-3">
      <div>
        <Label>Producto</Label>
        <Select
          value={productId}
          onChange={(event) => {
            setProductId(event.target.value);
            setError("");
            setLinked("");
            if (event.target.value) fieldRef.current?.focus();
          }}
        >
          <option value="">Elige un producto</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>{product.name}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Escanear</Label>
        <div className="flex gap-2">
          <CodeField inputRef={fieldRef} onCode={link} placeholder="Escanea el código del producto" />
          <ScannerButton onCode={link} />
        </div>
      </div>
      {pending ? <p className="text-sm text-slate-500">Vinculando…</p> : null}
      {linked ? <p className="text-sm text-teal-700">{linked}</p> : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
