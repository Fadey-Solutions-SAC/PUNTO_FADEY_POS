import { redirect } from "next/navigation";

export const instant = false;

export default function NewPurchasePage() {
  redirect("/compras/recepcion");
}
