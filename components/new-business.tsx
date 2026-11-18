"use client";

import { createBusinessAction } from "@/actions/auth";
import { Button, ErrorText, Field, Label } from "@/components/ui";
import { useActionState } from "react";

export function NewBusinessForm() {
  const [state, action, pending] = useActionState(createBusinessAction, { error: "" });
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div><Label>Nombre del negocio</Label><Field name="businessName" required /></div>
      <div><Label>Sucursal</Label><Field name="branchName" placeholder="Principal" /></div>
      <ErrorText>{state.error}</ErrorText>
      <Button disabled={pending}>{pending ? "Creando…" : "Crear negocio"}</Button>
    </form>
  );
}
