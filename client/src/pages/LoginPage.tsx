import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { login } from "../api"

export function LoginPage({ versionLabel, onSuccess }: { versionLabel: string; onSuccess: () => Promise<void> }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await login(username.trim(), password)
      await onSuccess()
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="absolute inset-0 bg-[#07111c]" />
      <div className="absolute inset-0 bg-[#061018]/72" />
      <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <img
          src="/brand/punto-fadey.jpg"
          alt="Punto Fadey"
          className="size-28 rounded-full object-cover shadow-[0_0_40px_rgba(20,138,132,0.35)]"
          onError={(event) => {
            event.currentTarget.style.display = "none"
          }}
        />
        <h1 className="mt-5 text-center text-3xl font-bold tracking-[0.12em] text-white sm:text-4xl">PUNTO FADEY</h1>
        <span className="mt-3 rounded-full border border-white/25 bg-black/25 px-3 py-1 text-xs text-white">{versionLabel}</span>
        <h2 className="mt-8 text-2xl font-semibold text-white">Iniciar sesión</h2>
        <p className="mt-1 text-sm text-white/75">Ingresa tus credenciales para continuar</p>

        <form onSubmit={onSubmit} className="mt-6 w-full max-w-md space-y-3">
          <label className="flex items-center gap-3 rounded-2xl bg-[#141b27]/85 px-4 py-3 ring-1 ring-white/10">
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-slate-300">Usuario</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
                placeholder="usuario"
              />
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-2xl bg-[#141b27]/85 px-4 py-3 ring-1 ring-white/10">
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-slate-300">Contraseña</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                className="w-full bg-transparent text-sm text-white outline-none"
              />
            </span>
            <button type="button" className="text-xs text-slate-300" onClick={() => setVisible((v) => !v)}>
              {visible ? "Ocultar" : "Ver"}
            </button>
          </label>
          {error ? <p className="rounded-xl bg-red-950/70 px-3 py-2 text-sm text-red-100">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-full bg-[#f5c518] text-sm font-semibold text-[#1a1403] transition hover:bg-[#e6b40a] disabled:opacity-60"
          >
            {pending ? "Entrando…" : "Ingresar"}
          </button>
        </form>
        <p className="mt-12 text-sm text-white/85">Sistema de gestión comercial · Vite (fase 2)</p>
      </div>
    </main>
  )
}
