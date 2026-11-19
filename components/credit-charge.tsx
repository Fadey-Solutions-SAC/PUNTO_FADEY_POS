"use client";

import { useSearchParams } from "next/navigation";
import { abonoAction } from "@/actions/operations";
import { AccountCharge } from "@/components/account-charge";

export function CreditCharge({
  currency,
  accounts,
  methods,
}: {
  currency: string;
  accounts: { saleId: string; customerId: string; due: number }[];
  methods?: { value: string; label: string }[];
}) {
  const cuenta = useSearchParams().get("cuenta") ?? "";
  const account = accounts.find((item) => item.saleId === cuenta);
  if (!account) return null;
  return (
    <AccountCharge
      key={account.saleId}
      amountCents={account.due}
      currency={currency}
      methods={methods}
      onSubmit={async (method, amount) => {
        const data = new FormData();
        data.set("customerId", account.customerId);
        data.set("saleId", account.saleId);
        data.set("method", method);
        data.set("amount", amount);
        const result = await abonoAction({ error: "" }, data);
        return result.error;
      }}
    />
  );
}
