import { redirect } from "next/navigation";

export const instant = false;

export default function ExitsPage() {
  redirect("/inventario/almacenes");
}
