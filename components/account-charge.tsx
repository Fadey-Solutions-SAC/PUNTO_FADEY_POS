"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChargeWindow, type ChargeMethod } from "@/components/charge-window";
import { fromMoneyInt } from "@/lib/money";

export function AccountCharge({
  amountCents,
  currency,
  methods,
  onSubmit,
  onClose,
}: {
  amountCents: number;
  currency: string;
  methods?: { value: string; label: string }[];
  onSubmit: (method: ChargeMethod, amount: string) => Promise<string>;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<ChargeMethod>(methods?.[0]?.value ?? "CASH");
  const [amount, setAmount] = useState(fromMoneyInt(amountCents).toFixed(2));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setAmount(fromMoneyInt(amountCents).toFixed(2));
  }, [amountCents]);

  async function confirm() {
    setPending(true);
    const message = await onSubmit(method, amount);
    setPending(false);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    onClose?.();
    router.refresh();
  }

  return (
    <ChargeWindow
      total={amountCents}
      currency={currency}
      payments={[{ method, amount, reference: "" }]}
      onPayments={(payments) => {
        setMethod(payments[0]?.method ?? "CASH");
        setAmount(payments[0]?.amount ?? "");
      }}
      methods={methods}
      allowSplit={false}
      pending={pending}
      error={error}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
