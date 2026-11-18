"use client";

import { saveProductAction, uploadImageAction } from "@/actions/catalog";
import { ProductPhoto } from "@/components/product-photo";
import { Button, Card, ErrorText, Field, Label, Select } from "@/components/ui";
import type { PresentationInput, ProductInput } from "@/lib/catalog";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Values = {
  id?: string;
  name: string;
  internalCode: string;
  categoryId: string;
  brandName: string;
  baseUnitId: string;
  description: string;
  costPrice: string;
  salePrice: string;
  wholesalePrice: string;
  retailPrice: string;
  minStock: string;
  maxStock: string;
  trackLots: boolean;
  isActive: boolean;
  barcodes: string[];
  presentations: (PresentationInput & { unitId: string; price: string; barcode: string })[];
};

const emptyPresentation = { name: "Unidad", factorToBase: "1", unitId: "", price: "", barcode: "", isDefault: true };

export function ProductForm({
  initial,
  imagePath,
  categories,
  brands,
  units,
}: {
  initial?: Values;
  imagePath?: string | null;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  units: { id: string; name: string; symbol: string }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(
    initial ?? {
      name: "",
      internalCode: "",
      categoryId: "",
      brandName: "",
      baseUnitId: units.find((unit) => unit.symbol === "und")?.id ?? units[0]?.id ?? "",
      description: "",
      costPrice: "0",
      salePrice: "0",
      wholesalePrice: "0",
      retailPrice: "0",
      minStock: "0",
      maxStock: "",
      trackLots: false,
      isActive: true,
      barcodes: [],
      presentations: [emptyPresentation],
    },
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  function patch(partial: Partial<Values>) {
    setValues((current) => ({ ...current, ...partial }));
  }

  async function submit() {
    setPending(true);
    setError("");
    const input: ProductInput = {
      ...values,
      categoryId: values.categoryId || undefined,
      brandName: values.brandName,
      maxStock: values.maxStock || undefined,
      presentations: values.presentations.map((item) => ({
        ...item,
        unitId: item.unitId || undefined,
        price: item.price || undefined,
        barcode: item.barcode || undefined,
      })),
    };
    const result = await saveProductAction(input);
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    if (file) {
      const data = new FormData();
      data.set("productId", result.id);
      data.set("image", file);
      await uploadImageAction(data);
    }
    router.push("/productos");
    router.refresh();
  }

  return (
    <Card className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        {values.id ? (
          <ProductPhoto name={values.name || "Producto"} imagePath={imagePath} productId={values.id} className="h-14 w-14" />
        ) : (
          <label className="cursor-pointer" title="Cargar imagen de referencia">
            {preview ? (
              <img src={preview} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-400">Foto</span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
                setPreview(next ? URL.createObjectURL(next) : "");
              }}
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <Label>Nombre</Label>
          <Field value={values.name} className="uppercase" onChange={(event) => patch({ name: event.target.value.toLocaleUpperCase("es-PE") })} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Código interno</Label>
          <Field value={values.internalCode} onChange={(event) => patch({ internalCode: event.target.value })} placeholder="Se genera si lo dejas vacío" />
        </div>
        <div>
          <Label>Categoría</Label>
          <Select value={values.categoryId} onChange={(event) => patch({ categoryId: event.target.value })}>
            <option value="">Sin categoría</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Marca</Label>
          <Field list="product-brands" value={values.brandName} placeholder="Escribe la marca" onChange={(event) => patch({ brandName: event.target.value })} />
          <datalist id="product-brands">
            {brands.map((item) => <option key={item.id} value={item.name} />)}
          </datalist>
        </div>
        <div>
          <Label>Unidad</Label>
          <Select value={values.baseUnitId} onChange={(event) => patch({ baseUnitId: event.target.value })}>
            {units.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.symbol})</option>)}
          </Select>
        </div>
        <div><Label>Costo</Label><Field value={values.costPrice} onChange={(event) => patch({ costPrice: event.target.value })} /></div>
        <div><Label>Precio de venta</Label><Field value={values.salePrice} onChange={(event) => patch({ salePrice: event.target.value })} /></div>
        <div><Label>Minorista</Label><Field value={values.retailPrice} onChange={(event) => patch({ retailPrice: event.target.value })} /></div>
        <div><Label>Mayorista</Label><Field value={values.wholesalePrice} onChange={(event) => patch({ wholesalePrice: event.target.value })} /></div>
        <div><Label>Stock mínimo</Label><Field value={values.minStock} onChange={(event) => patch({ minStock: event.target.value })} /></div>
        <div><Label>Stock máximo</Label><Field value={values.maxStock} onChange={(event) => patch({ maxStock: event.target.value })} /></div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.trackLots} onChange={(event) => patch({ trackLots: event.target.checked })} /> Controlar lotes y vencimiento</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.isActive} onChange={(event) => patch({ isActive: event.target.checked })} /> Activo</label>
      </div>
      <div>
        <Label>Presentaciones</Label>
        <p className="mb-2 text-xs text-slate-500">El factor indica cuántas unidades descuenta cada presentación.</p>
        <div className="space-y-2">
          {values.presentations.map((presentation, index) => (
            <div key={presentation.id ?? index} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
              <Field value={presentation.name} onChange={(event) => patch({ presentations: values.presentations.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} placeholder="Nombre" aria-label={`Presentación ${index + 1}`} />
              <Field value={presentation.factorToBase} onChange={(event) => patch({ presentations: values.presentations.map((item, itemIndex) => itemIndex === index ? { ...item, factorToBase: event.target.value } : item) })} placeholder="Factor" aria-label={`Factor ${index + 1}`} />
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={presentation.isDefault} onChange={() => patch({ presentations: values.presentations.map((item, itemIndex) => ({ ...item, isDefault: itemIndex === index })) })} />
                Predeterminada
              </label>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" className="mt-2" onClick={() => patch({ presentations: [...values.presentations, { ...emptyPresentation, isDefault: false, name: "" }] })}>Otra presentación</Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="button" disabled={pending} onClick={submit}>{pending ? "Guardando…" : "Guardar producto"}</Button>
    </Card>
  );
}
