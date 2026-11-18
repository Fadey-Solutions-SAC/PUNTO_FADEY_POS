"use client";

import { importCatalogAction } from "@/actions/catalog";
import { Button, ErrorText } from "@/components/ui";
import { useActionState } from "react";

export function ImportCatalog() {
  const [state, action, pending] = useActionState(importCatalogAction, { error: "", message: "" });
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
      <Button disabled={pending} variant="secondary">{pending ? "Importando…" : "Importar CSV"}</Button>
      <ErrorText>{state.error}</ErrorText>
      {state.message ? <p className="text-sm text-teal-800">{state.message}</p> : null}
    </form>
  );
}
