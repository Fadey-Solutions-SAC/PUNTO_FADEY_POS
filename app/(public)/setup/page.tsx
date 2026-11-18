import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ConfigLoginForm, SetupForm } from "@/components/auth-forms";
import { businessCount } from "@/lib/setup";

export const instant = false;

export default async function SetupPage() {
  await connection();
  if ((await businessCount()) > 0) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <p className="text-xs uppercase tracking-[0.18em] text-teal-700">Punto Fadey</p>
      <h1 className="mt-2 text-2xl font-semibold">Crear el primer negocio</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Se crea el dueño, la sucursal, el almacén principal y la caja 1. No se cargan productos de ejemplo.</p>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <SetupForm />
        <div className="my-4 border-t border-slate-100 pt-4">
          <ConfigLoginForm tone="light" />
        </div>
      </div>
    </main>
  );
}
