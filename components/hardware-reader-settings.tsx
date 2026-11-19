"use client";

import { saveHardwareReaderAction } from "@/actions/operations";
import { Card, ErrorText } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function HardwareReaderSettings({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function toggle(next: boolean) {
    setPending(true);
    setError("");
    const result = await saveHardwareReaderAction(next);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOn(next);
    router.refresh();
  }

  return (
    <Card>
      <h2 className="mb-1 font-medium">Lector USB o Bluetooth</h2>
      <p className="mb-3 text-sm text-slate-500">
        Actívalo si usas un lector físico de códigos. Aparecerá un campo en la venta para recibir lecturas.
      </p>
      <label className="flex items-center gap-3 text-sm text-navy">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(event) => toggle(event.target.checked)}
          className="size-4 rounded border-slate-300 text-primary focus:ring-primary"
        />
        {on ? "Lector vinculado / activo" : "Lector desactivado"}
      </label>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
