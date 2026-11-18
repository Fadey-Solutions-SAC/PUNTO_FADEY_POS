"use client";

import { createWarehouseAction } from "@/actions/operations";
import { Button, ErrorText, Field, actionLink } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

export function WarehouseCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createWarehouseAction, { error: "" });
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
      <button type="button" className={actionLink.primary} onClick={() => setOpen((value) => !value)}>
        Nuevo almacén
      </button>
      {open ? (
        <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
          <Field name="name" required autoFocus placeholder="Nombre del almacén" className="w-56" />
          <Button disabled={pending}>{pending ? "Guardando…" : "Crear"}</Button>
          <ErrorText>{state.error}</ErrorText>
        </form>
      ) : null}
    </div>
  );
}
