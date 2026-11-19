"use client";

import { createPaymentMethodAction, deletePaymentMethodAction } from "@/actions/operations";
import { Button, Card, ErrorText, Field } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Method = { id: string; code: string; label: string; locked: boolean };

export function PaymentMethodsSettings({ methods }: { methods: Method[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    setError("");
    const result = await createPaymentMethodAction(label);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLabel("");
    router.refresh();
  }

  async function remove(id: string) {
    setPending(true);
    setError("");
    const result = await deletePaymentMethodAction(id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <h2 className="mb-1 font-medium">Métodos de pago</h2>
      <p className="mb-3 text-sm text-slate-500">Se usan al cobrar ventas, abonos y compras. El efectivo no se puede eliminar.</p>
      <ul className="mb-3 divide-y divide-slate-100 text-sm">
        {methods.map((method) => (
          <li key={method.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="font-medium text-navy">{method.label}</span>
            {method.locked ? (
              <span className="text-xs text-slate-400">Fijo</span>
            ) : (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => remove(method.id)}>Eliminar</Button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Field className="min-w-[12rem] flex-1" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ej. Yape, Plin…" />
        <Button type="button" disabled={pending || label.trim().length < 2} onClick={create}>
          {pending ? "Guardando…" : "Crear método"}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
