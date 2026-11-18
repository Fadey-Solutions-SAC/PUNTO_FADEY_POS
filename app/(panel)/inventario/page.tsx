import { redirect } from "next/navigation";

export const instant = false;

export default function StockPage() {
  redirect("/inventario/almacenes");
}
