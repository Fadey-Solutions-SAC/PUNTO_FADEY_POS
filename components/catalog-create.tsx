"use client";

import { saveCategoryAction } from "@/actions/catalog";
import { Button, ErrorText, Field, actionLink } from "@/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

const lightButton =
  "inline-flex h-10 items-center justify-center rounded-xl px-3.5 text-sm font-medium transition";

export function CatalogCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveCategoryAction, { error: "" });
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
      router.refresh();
    }
    wasPending.current = pending;
  }, [pending, state.error, router]);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className={lightButton}
          style={{ background: "color-mix(in srgb, var(--pf-button) 18%, white)", color: "var(--pf-button)" }}
          onClick={() => setOpen((value) => !value)}
        >
          Categoría
        </button>
        <Link href="/productos/nuevo" className={actionLink.primary}>Nuevo producto</Link>
      </div>
      {open ? (
        <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
          <Field
            name="name"
            required
            autoFocus
            placeholder="NUEVA CATEGORÍA"
            className="w-52 uppercase"
            onInput={(event) => {
              const input = event.currentTarget;
              const next = input.value.toLocaleUpperCase("es-PE");
              if (next !== input.value) input.value = next;
            }}
          />
          <Button disabled={pending}>{pending ? "Guardando…" : "Agregar"}</Button>
          <ErrorText>{state.error}</ErrorText>
        </form>
      ) : null}
    </div>
  );
}
