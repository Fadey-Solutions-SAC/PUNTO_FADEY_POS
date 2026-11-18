"use client";

import { Button, ErrorText, Field, Label } from "@/components/ui";
import { useActionState } from "react";

export function WipeDataForm({
  action,
}: {
  action: (prev: { error: string }, formData: FormData) => Promise<{ error: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  return (
    <form action={formAction} className="max-w-md space-y-3">
      <div>
        <Label>Contraseña</Label>
        <Field name="password" type="password" required autoComplete="current-password" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" required />
        Entiendo que se borrarán todos los datos
      </label>
      <ErrorText>{state.error}</ErrorText>
      <Button variant="danger" disabled={pending}>{pending ? "Borrando…" : "Borrar todos los datos"}</Button>
    </form>
  );
}
