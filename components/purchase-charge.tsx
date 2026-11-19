"use client";

import { payPurchaseAction } from "@/actions/part2";
import { AccountCharge } from "@/components/account-charge";

export function PurchaseCharge({
  purchaseId,
  amountCents,
  currency,
  methods,
}: {
  purchaseId: string;
  amountCents: number;
  currency: string;
  methods?: { value: string; label: string }[];
}) {
  return (
    <AccountCharge
      amountCents={amountCents}
      currency={currency}
      methods={methods}
      onSubmit={async (method, amount) => {
        const data = new FormData();
        data.set("purchaseId", purchaseId);
        data.set("method", method);
        data.set("amount", amount);
        const result = await payPurchaseAction({ error: "" }, data);
        return result.error;
      }}
    />
  );
}
