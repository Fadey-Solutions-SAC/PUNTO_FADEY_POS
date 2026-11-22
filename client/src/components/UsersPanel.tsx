import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { createUser, deleteUser, getUsers, saveRolePermissions, updateUser, type UserInput, type UserRow } from "../api"

type Data = Awaited<ReturnType<typeof getUsers>>

const ROLE_COLOR: Record<string, string> = {
  OWNER: "#0d9488",
  ADMIN: "#6366f1",
  MANAGER: "#8b5cf6",
  CASHIER: "#f59e0b",
  WAREHOUSE: "#0ea5e9",
  SELLER: "#10b981",
}

/** Usuarios del negocio y permisos por rol (solo el dueño puede cambiarlos). */
export function UsersPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [editing, setEditing] = useState<UserRow | "new" | null>(null)
  const [tab, setTab] = useState<"users" | "roles">("users")

  const load = useCallback(
    () =>
      getUsers()
        .then(setData)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error")),
    [],
  )

  useEffect(() => {
    void load()
  }, [load])

  async function onDelete(user: UserRow) {
    if (!window.confirm(`¿Eliminar el acceso de ${user.name}? Ya no podrá entrar a este negocio.`)) return
    setError("")
    try {
      await deleteUser(user.id)
      setMessage(`${user.name} ya no tiene acceso.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar")
    }
  }

  if (!data) return error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <p className="text-sm text-slate-500">Cargando…</p>

  const label = (code: string) => data.permissions.find((item) => item.code === code)?.label ?? code

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["users", "Usuarios"],
              ["roles", "Permisos por rol"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${tab === value ? "bg-white text-[var(--pf-navy)] shadow-sm" : "text-slate-500"}`}
            >
              {text}
            </button>
          ))}
        </div>
        {tab === "users" && data.canManage ? (
          <button
            type="button"
            onClick={() => {
              setMessage("")
              setEditing("new")
            }}
            className="h-10 rounded-xl bg-sky-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-600"
          >
            + Nuevo usuario
          </button>
        ) : null}
      </div>

      {!data.canManage ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Solo el dueño o un administrador pueden crear, editar o eliminar usuarios y permisos.</p>
      ) : null}
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

      {tab === "users" ? (
        <ul className="grid gap-2 lg:grid-cols-2">
          {data.users.map((user) => {
            const color = ROLE_COLOR[user.role] ?? "#64748b"
            const owner = user.role === "OWNER"
            return (
              <li key={user.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: color }}>
                    {user.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((word) => word[0]?.toUpperCase())
                      .join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[var(--pf-navy)]">
                      {user.name}
                      {user.id === data.currentUserId ? <span className="ml-1 text-xs font-normal text-slate-400">(tú)</span> : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      Usuario: <b>{user.username || "—"}</b>
                      {user.registerName ? ` · ${user.registerName}` : ""}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: color }}>
                        {user.roleLabel}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {owner ? "Acceso total" : user.mode === "custom" ? "Permisos personalizados" : "Permisos de su rol"}
                      </span>
                    </div>
                    {!owner ? (
                      <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{user.permissions.map(label).join(" · ") || "Sin permisos"}</p>
                    ) : null}
                  </div>
                  {data.canManage ? (
                    <div className="flex shrink-0 flex-col gap-1 text-xs">
                      <button type="button" onClick={() => setEditing(user)} className="rounded-lg px-2 py-1 font-semibold text-[var(--pf-accent)] hover:bg-slate-100">
                        Editar
                      </button>
                      {!owner && user.id !== data.currentUserId ? (
                        <button type="button" onClick={() => void onDelete(user)} className="rounded-lg px-2 py-1 font-semibold text-red-700 hover:bg-red-50">
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <RoleMatrix
          data={data}
          onSaved={async (changes) => {
            setMessage(`Permisos por rol guardados (${changes} diferencia${changes === 1 ? "" : "s"} con los valores por defecto).`)
            await load()
          }}
          onError={setError}
        />
      )}

      {editing ? (
        <UserForm
          data={data}
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null)
            setMessage(text)
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

function UserForm({
  data,
  user,
  onClose,
  onSaved,
}: {
  data: Data
  user: UserRow | null
  onClose: () => void
  onSaved: (message: string) => void | Promise<void>
}) {
  const isNew = !user
  const owner = user?.role === "OWNER"
  const [form, setForm] = useState({
    name: user?.name ?? "",
    username: user?.username ?? "",
    password: "",
    role: user?.role ?? data.roles.find((item) => item.code === "CASHIER")?.code ?? data.roles[0]?.code ?? "",
    registerId: user?.registerId ?? data.registers[0]?.id ?? "",
    mode: (user?.mode ?? "role") as "role" | "custom",
  })
  const rolePermissions = useMemo(
    () => data.roleMatrix.find((row) => row.role === form.role)?.permissions ?? [],
    [data.roleMatrix, form.role],
  )
  const [custom, setCustom] = useState<string[]>(user?.mode === "custom" ? user.permissions : rolePermissions)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const shown = form.mode === "custom" ? custom : rolePermissions

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    const input: UserInput = {
      name: form.name,
      username: form.username,
      password: form.password || undefined,
      registerId: form.registerId,
      mode: owner ? "role" : form.mode,
      permissions: form.mode === "custom" ? custom : undefined,
      // El rol también se puede cambiar al editar (al Dueño solo desde el modo configuración).
      ...(isNew || form.role !== user?.role ? { role: form.role } : {}),
    }
    try {
      if (isNew) await createUser(input)
      else await updateUser(user.id, input)
      await onSaved(isNew ? `Usuario ${form.username} creado. Ya puede iniciar sesión.` : `${form.name} actualizado.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[var(--pf-navy)]/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? "Nuevo usuario" : "Editar usuario"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <form onSubmit={onSubmit} className="max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-xl space-y-3 overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 shadow-xl sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--pf-navy)]">{isNew ? "Nuevo usuario" : `Editar · ${user.name}`}</h2>
          <button type="button" className="text-sm text-slate-500" onClick={onClose} disabled={saving}>
            Cerrar
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
            Nombre completo
            <input required className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej. María López" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Usuario (para iniciar sesión)
            <input
              required
              autoCapitalize="none"
              autoComplete="off"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s+/g, "") }))}
              placeholder="ej. maria"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {isNew ? "Contraseña" : "Nueva contraseña"} <span className="font-normal text-slate-400">{isNew ? "(mín. 8)" : "(vacía = no cambia)"}</span>
            <input
              type="password"
              autoComplete="new-password"
              required={isNew}
              minLength={isNew ? 8 : undefined}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Rol
            <select
              disabled={!isNew && owner && !data.configMode}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 disabled:bg-slate-50"
              value={form.role}
              onChange={(e) => {
                const role = e.target.value
                setForm((f) => ({ ...f, role }))
                setCustom(data.roleMatrix.find((row) => row.role === role)?.permissions ?? [])
              }}
            >
              {owner && !data.roles.some((role) => role.code === "OWNER") ? <option value="OWNER">Dueño</option> : null}
              {data.roles.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Caja asignada
            <select className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2" value={form.registerId} onChange={(e) => setForm((f) => ({ ...f, registerId: e.target.value }))}>
              <option value="">Sin caja</option>
              {data.registers.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!owner ? (
          <div className="space-y-2 rounded-2xl border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {(
                [
                  ["role", "Según su rol"],
                  ["custom", "Personalizados"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mode: value }))}
                  className={`h-9 rounded-lg text-sm font-semibold ${form.mode === value ? "bg-white text-[var(--pf-navy)] shadow-sm" : "text-slate-500"}`}
                >
                  {text}
                </button>
              ))}
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {data.permissions.map((permission) => {
                const checked = shown.includes(permission.code)
                return (
                  <label
                    key={permission.code}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${form.mode === "custom" ? "cursor-pointer hover:bg-slate-50" : "opacity-70"}`}
                  >
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={checked}
                      disabled={form.mode !== "custom"}
                      onChange={(e) =>
                        setCustom((current) => (e.target.checked ? [...current, permission.code] : current.filter((item) => item !== permission.code)))
                      }
                    />
                    {permission.label}
                  </label>
                )
              })}
            </div>
            {form.mode === "role" ? <p className="text-xs text-slate-500">Usa los permisos de su rol; si cambias los permisos del rol, se aplican a este usuario.</p> : null}
          </div>
        ) : (
          <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">El dueño tiene acceso total y no se puede eliminar.</p>
        )}

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button type="submit" disabled={saving} className="h-12 w-full rounded-xl bg-sky-500 text-base font-semibold text-white shadow-sm disabled:opacity-50">
          {saving ? "Guardando…" : isNew ? "Crear usuario" : "Guardar cambios"}
        </button>
      </form>
    </div>
  )
}

function RoleMatrix({ data, onSaved, onError }: { data: Data; onSaved: (changes: number) => void | Promise<void>; onError: (text: string) => void }) {
  const [grants, setGrants] = useState<Set<string>>(
    () => new Set(data.roleMatrix.flatMap((row) => row.permissions.map((permission) => `${row.role}|${permission}`))),
  )
  const [saving, setSaving] = useState(false)

  async function onSave() {
    setSaving(true)
    onError("")
    try {
      const result = await saveRolePermissions([...grants])
      await onSaved(result.changes)
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Permiso</th>
                {data.roleMatrix.map((row) => (
                  <th key={row.role} className="px-2 py-2 text-center" style={{ color: ROLE_COLOR[row.role] }}>
                    {row.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.permissions.map((permission) => (
                <tr key={permission.code}>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">{permission.label}</td>
                  {data.roleMatrix.map((row) => {
                    const key = `${row.role}|${permission.code}`
                    return (
                      <td key={key} className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${row.label}: ${permission.label}`}
                          className="size-4"
                          disabled={!data.canManage}
                          checked={grants.has(key)}
                          onChange={(e) =>
                            setGrants((current) => {
                              const next = new Set(current)
                              if (e.target.checked) next.add(key)
                              else next.delete(key)
                              return next
                            })
                          }
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-500">El dueño siempre tiene todos los permisos. Los usuarios con permisos personalizados no usan esta tabla.</p>
      {data.canManage ? (
        <button type="button" disabled={saving} onClick={() => void onSave()} className="h-11 rounded-xl bg-sky-500 px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar permisos por rol"}
        </button>
      ) : null}
    </div>
  )
}
