import { redirect } from "next/navigation";

export const instant = false;

export default function PurchasesPage() {
  redirect("/compras/historial");
}
