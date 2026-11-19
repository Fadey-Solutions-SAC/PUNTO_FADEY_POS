import { connection } from "next/server";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { brandLogoUrl, loginCoverUrl } from "@/lib/cover";
import { businessCount } from "@/lib/setup";
import { formatAppVersion } from "@/lib/version";

export const instant = false;

export default async function LoginPage() {
  await connection();
  if ((await businessCount()) === 0) redirect("/setup");
  const [cover, logo] = await Promise.all([loginCoverUrl(), brandLogoUrl()]);
  return (
    <main className="relative min-h-screen overflow-hidden">
      {cover ? (
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[#07111c]" />
      )}
      <div className="absolute inset-0 bg-[#061018]/72" />
      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <img src={logo ?? "/brand/punto-fadey.jpg"} alt="Punto Fadey" className="size-28 rounded-full object-cover shadow-[0_0_40px_rgba(20,138,132,0.35)]" />
        <h1 className="mt-5 text-center text-3xl font-bold tracking-[0.12em] text-white sm:text-4xl">PUNTO FADEY</h1>
        <span className="mt-3 rounded-full border border-white/25 bg-black/25 px-3 py-1 text-xs text-white">{formatAppVersion()}</span>
        <h2 className="mt-8 text-2xl font-semibold text-white">Iniciar sesión</h2>
        <p className="mt-1 text-sm text-white/75">Ingresa tus credenciales para continuar</p>
        <div className="mt-6 w-full max-w-md">
          <LoginForm />
        </div>
        <p className="mt-12 text-sm text-white/85">Sistema de gestión comercial</p>
      </div>
    </main>
  );
}
