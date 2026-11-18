"use client";

import { configLoginAction, loginAction, setupAction } from "@/actions/auth";
import { Button, ErrorText, Field, Label } from "@/components/ui";
import Eye from "lucide-react/icons/eye";
import EyeOff from "lucide-react/icons/eye-off";
import Lock from "lucide-react/icons/lock";
import LogIn from "lucide-react/icons/log-in";
import UserRound from "lucide-react/icons/user-round";
import { useActionState, useState } from "react";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  const [visible, setVisible] = useState(false);
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-center gap-3 rounded-2xl bg-[#141b27]/85 px-4 py-3 ring-1 ring-white/10">
        <UserRound className="text-slate-300" size={18} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-slate-300">Usuario</span>
          <input name="username" autoComplete="username" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-400" placeholder="usuario" />
        </span>
      </label>
      <label className="flex items-center gap-3 rounded-2xl bg-[#141b27]/85 px-4 py-3 ring-1 ring-white/10">
        <Lock className="text-slate-300" size={18} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-slate-300">Contraseña</span>
          <input name="password" type={visible ? "text" : "password"} autoComplete="current-password" className="w-full bg-transparent text-sm text-white outline-none" />
        </span>
        <button type="button" className="text-slate-300" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </label>
      {state.error ? <p className="rounded-xl bg-red-950/70 px-3 py-2 text-sm text-red-100">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f5c518] text-sm font-semibold text-[#1a1403] transition hover:bg-[#e6b40a] disabled:opacity-60">
        <LogIn size={16} />
        {pending ? "Entrando…" : "Ingresar"}
      </button>
    </form>
  );
}

export function ConfigLoginForm({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [state, action, pending] = useActionState(configLoginAction, { error: "" });
  const [visible, setVisible] = useState(false);
  if (tone === "light") {
    return (
      <form action={action} className="space-y-3">
        <p className="text-sm text-slate-500">Entras solo con contraseña. No se registra un usuario.</p>
        <div><Label>Contraseña</Label><Field name="password" type={visible ? "text" : "password"} required autoComplete="current-password" /></div>
        <ErrorText>{state.error}</ErrorText>
        <Button className="w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar a configurar"}</Button>
      </form>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-white/75">Entras solo con contraseña. No se registra un usuario.</p>
      <label className="flex items-center gap-3 rounded-2xl bg-[#141b27]/85 px-4 py-3 ring-1 ring-white/10">
        <Lock className="text-slate-300" size={18} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-slate-300">Contraseña</span>
          <input name="password" type={visible ? "text" : "password"} required autoComplete="current-password" className="w-full bg-transparent text-sm text-white outline-none" />
        </span>
        <button type="button" className="text-slate-300" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </label>
      {state.error ? <p className="rounded-xl bg-red-950/70 px-3 py-2 text-sm text-red-100">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f5c518] text-sm font-semibold text-[#1a1403] transition hover:bg-[#e6b40a] disabled:opacity-60">
        <LogIn size={16} />
        {pending ? "Entrando…" : "Entrar a configurar"}
      </button>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, { error: "" });
  return (
    <form action={action} className="space-y-3">
      <div><Label>Tu nombre</Label><Field name="name" required /></div>
      <div><Label>Correo</Label><Field name="email" type="email" required /></div>
      <div><Label>Contraseña</Label><Field name="password" type="password" required minLength={8} /></div>
      <div><Label>Negocio</Label><Field name="businessName" required /></div>
      <div><Label>Sucursal</Label><Field name="branchName" placeholder="Principal" /></div>
      <ErrorText>{state.error}</ErrorText>
      <Button className="w-full" disabled={pending}>{pending ? "Creando…" : "Crear negocio"}</Button>
    </form>
  );
}
