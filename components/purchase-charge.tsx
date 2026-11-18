"use client";

import { payPurchaseAction } from "@/actions/part2";
import { AccountCharge } from "@/components/account-charge";

export function PurchaseCharge({
  purchaseId,
  amountCents,
  currency,
}: {
  purchaseId: string;
  amountCents: number;
  currency: string;
}) {
  return (
    <AccountCharge
      amountCents={amountCents}
      currency={currency}
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
