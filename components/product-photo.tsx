"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { uploadImageAction } from "@/actions/catalog";

export function ProductPhoto({
  name,
  imagePath,
  productId,
  className = "h-10 w-10",
}: {
  name: string;
  imagePath?: string | null;
  productId?: string;
  className?: string;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const src = preview || imagePath || "";
  const circle = src ? (
    <img src={src} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : productId ? (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-400`}>
      Foto
    </span>
  ) : (
    <span className={`${className} shrink-0 rounded-full bg-slate-100`} />
  );

  if (!productId) return circle;

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !productId) return;
    setPreview(URL.createObjectURL(file));
    setError("");
    setPending(true);
    const data = new FormData();
    data.set("productId", productId);
    data.set("image", file);
    const result = await uploadImageAction(data);
    setPending(false);
    if (!result.ok) {
      setPreview("");
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <label className={`relative cursor-pointer ${pending ? "opacity-60" : ""}`} title={`Cargar imagen de ${name}`}>
        {circle}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onChange} disabled={pending} />
      </label>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
