import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Building2,
  DatabaseBackup,
  CreditCard,
  Info,
  Palette,
  Ruler,
  Warehouse,
  Printer,
  ScanBarcode,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react"
import {
  createSettingsPaymentMethod,
  deleteSettingsImage,
  deleteSettingsPaymentMethod,
  getSettings,
  saveSettingsBusiness,
  saveSettingsTheme,
  uploadSettingsImage,
} from "../api"
import { shrinkImage } from "../image"
import { UsersPanel } from "../components/UsersPanel"
import { BackupsPanel } from "../components/BackupsPanel"
import { ReaderSettings } from "../components/ReaderSettings"
import { WipeDataPanel } from "../components/WipeDataPanel"
import { PlacesPanel } from "../components/PlacesPanel"
import { UnitsPage } from "./UnitsPage"
import { AssistantSettings } from "../components/AssistantSettings"

type Settings = Awaited<ReturnType<typeof getSettings>>
type ModuleId = "negocio" | "apariencia" | "pagos" | "sucursales" | "almacenes" | "unidades" | "usuarios" | "impresion" | "copias" | "lector" | "sistema"

const MODULES: { id: ModuleId; label: string; hint: string; icon: LucideIcon; color: string }[] = [
  { id: "negocio", label: "Negocio", hint: "Nombre, RUC, moneda, logo y portada", icon: Building2, color: "#0d9488" },
  { id: "apariencia", label: "Apariencia", hint: "Color del sistema", icon: Palette, color: "#8b5cf6" },
  { id: "pagos", label: "Medios de pago", hint: "Efectivo, Yape, tarjeta…", icon: CreditCard, color: "#6366f1" },
  { id: "sucursales", label: "Sucursales y cajas", hint: "Locales y cajas", icon: Store, color: "#f59e0b" },
  { id: "almacenes", label: "Almacenes", hint: "Crear y elegir almacenes", icon: Warehouse, color: "#d97706" },
  { id: "unidades", label: "Unidades", hint: "Peso, volumen y conversiones", icon: Ruler, color: "#14b8a6" },
  { id: "usuarios", label: "Usuarios y permisos", hint: "Accesos, roles y contraseñas", icon: Users, color: "#0ea5e9" },
  { id: "impresion", label: "Impresión y SUNAT", hint: "Asistente local: ticketera y comprobantes", icon: Printer, color: "#0f766e" },
  { id: "copias", label: "Copias de seguridad", hint: "Respaldo de toda la información", icon: DatabaseBackup, color: "#334155" },
  { id: "lector", label: "Lector de código", hint: "Escáner USB o Bluetooth", icon: ScanBarcode, color: "#10b981" },
  { id: "sistema", label: "Sistema", hint: "Versión instalada", icon: Info, color: "#64748b" },
]


export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const active = (MODULES.find((item) => item.id === params.get("m"))?.id ?? "negocio") as ModuleId
  const [data, setData] = useState<Settings | null>(null)
  const [business, setBusiness] = useState({
    name: "",
    legalName: "",
    taxId: "",
    currency: "PEN",
    discountLimitPct: "10",
    allowCredit: false,
    address: "",
    phone: "",
    email: "",
  })
  const [methodLabel, setMethodLabel] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)

  async function reload() {
    const payload = await getSettings()
    setData(payload)
    setBusiness({ ...payload.business, address: payload.business.address ?? "", phone: payload.business.phone ?? "", email: payload.business.email ?? "" })
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  async function run(action: () => Promise<unknown>, ok = "Guardado") {
    setPending(true)
    setError("")
    setMessage("")
    try {
      await action()
      await reload()
      setMessage(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
    } finally {
      setPending(false)
    }
  }

  function open(id: ModuleId) {
    setError("")
    setMessage("")
    setParams({ m: id }, { replace: true })
  }

  async function onBusiness(event: FormEvent) {
    event.preventDefault()
    await run(() => saveSettingsBusiness(business), "Datos del negocio guardados")
  }

  const current = MODULES.find((item) => item.id === active)!

  const summary: Record<ModuleId, string> = {
    negocio: data?.business.name || "—",
    apariencia: data?.themes.find((item) => item.id === data.theme)?.label ?? "…",
    pagos: data ? `${data.paymentMethods.length} medios` : "…",
    sucursales: data ? `${data.branches.length} sucursal${data.branches.length === 1 ? "" : "es"}` : "…",
    almacenes: data ? `${data.branches.reduce((n, b) => n + (b.warehouseList?.length ?? 0), 0)} almacenes` : "…",
    unidades: "Unidades de medida",
    usuarios: data ? `${data.users.length} usuario${data.users.length === 1 ? "" : "s"}` : "…",
    impresion: "Ticketera y facturación",
    copias: "Descargar y automáticas",
    lector: data ? (data.hardwareReader ? "Activado" : "Desactivado") : "…",
    sistema: data?.versionLabel ?? "…",
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-slate-500">Elige un módulo para ver y cambiar sus opciones.</p>
      </div>

      {/* Teléfono: fila con scroll lateral. Tablet y PC: cuadrícula de módulos. */}
      <nav
        aria-label="Módulos de configuración"
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:gap-3 md:overflow-visible md:px-0 md:pb-0"
      >
        {MODULES.map((item) => {
          const Icon = item.icon
          const selected = item.id === active
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => open(item.id)}
              aria-current={selected ? "page" : undefined}
              className={`flex w-40 shrink-0 snap-start flex-col items-start gap-2 rounded-2xl border bg-white p-3 text-left shadow-sm transition md:w-auto md:flex-row md:items-center md:gap-3 ${
                selected ? "ring-2" : "hover:-translate-y-0.5 hover:shadow-md"
              }`}
              style={{
                borderColor: selected ? item.color : "#e2e8f0",
                boxShadow: selected ? `0 0 0 2px ${item.color}33` : undefined,
              }}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ background: item.color }}>
                <Icon size={20} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--pf-navy)]">{item.label}</span>
                <span className="block truncate text-xs text-slate-500">{summary[item.id]}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3" style={{ background: `${current.color}0f` }}>
          <span className="grid size-9 place-items-center rounded-xl text-white" style={{ background: current.color }}>
            <current.icon size={18} />
          </span>
          <div>
            <h2 className="font-semibold text-[var(--pf-navy)]">{current.label}</h2>
            <p className="text-xs text-slate-500">{current.hint}</p>
          </div>
        </header>

        <div className="space-y-3 p-4">
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}
          {!data ? <p className="text-sm text-slate-500">Cargando…</p> : null}

          {data && active === "negocio" ? (
            <form onSubmit={onBusiness} className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["name", "Nombre comercial"],
                  ["legalName", "Razón social"],
                  ["taxId", "RUC o documento"],
                  ["address", "Dirección"],
                  ["phone", "Teléfono"],
                  ["email", "Correo"],
                  ["currency", "Moneda"],
                  ["discountLimitPct", "Tope de descuento (%)"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    className="h-11 w-full rounded-xl border border-slate-200 px-3"
                    value={business[key]}
                    placeholder={
                      {
                        name: "Ej. Bodega Don Lucho",
                        legalName: "Ej. INVERSIONES LUCHO S.A.C.",
                        taxId: "Ej. 20601234567",
                        address: "Ej. Jr. Los Olivos 245, Moyobamba",
                        phone: "Ej. 987 654 321",
                        email: "Ej. ventas@minegocio.com",
                        currency: "Ej. PEN",
                        discountLimitPct: "Ej. 10",
                      }[key]
                    }
                    onChange={(event) => setBusiness((value) => ({ ...value, [key]: event.target.value }))}
                    required={key === "name" || key === "currency"}
                  />
                </Field>
              ))}
              <p className="text-xs text-slate-500 sm:col-span-2">
                Nombre, razón social, RUC, dirección, teléfono y correo se imprimen en la nota de venta, la boleta y la factura.
              </p>
              <SaveButton pending={pending} color={current.color}>
                Guardar negocio
              </SaveButton>
            </form>
          ) : null}

          {data && active === "negocio" ? (
            <div className="grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
              <h3 className="font-semibold text-[var(--pf-navy)] md:col-span-2">Logo y portada</h3>
              <ImageSlot
                title="Logo"
                description="Se ve en la pantalla de inicio de sesión de este negocio. Cuadrado, PNG o JPG."
                url={data.logo}
                round
                pending={pending}
                onPick={(file) =>
                  run(async () => uploadSettingsImage("logo", await shrinkImage(file, { max: 512, keepAlpha: true })), "Logo actualizado")
                }
                onRemove={() =>
                  run(() => deleteSettingsImage("logo"), "Logo eliminado")
                }
              />
              <ImageSlot
                title="Portada de inicio"
                description="Fondo de la pantalla para iniciar sesión. Horizontal, ideal 1600 × 900."
                url={data.cover}
                pending={pending}
                onPick={(file) =>
                  run(async () => uploadSettingsImage("cover", await shrinkImage(file, { max: 1920, quality: 0.82 })), "Portada actualizada")
                }
                onRemove={() => run(() => deleteSettingsImage("cover"), "Portada eliminada")}
              />
              <p className="text-xs text-slate-500 md:col-span-2">
                Cada negocio tiene su propio logo y portada para su pantalla de inicio de sesión (se muestran los del último
                negocio que entró en ese equipo). Dentro del sistema y en el navegador siempre se ve la marca Punto Fadey.
              </p>
            </div>
          ) : null}

          {data && active === "apariencia" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.themes.map((theme) => {
                const selected = theme.id === data.theme
                return (
                  <button
                    key={theme.id}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await saveSettingsTheme(theme.id)
                        window.setTimeout(() => window.location.reload(), 400)
                      }, "Color aplicado")
                    }
                    className={`overflow-hidden rounded-2xl border text-left shadow-sm transition hover:shadow-md ${
                      selected ? "ring-2 ring-[var(--pf-accent)]" : "border-slate-200"
                    }`}
                  >
                    <span className="flex h-16" aria-hidden>
                      <span className="w-1/3" style={{ background: theme.panel }} />
                      <span className="flex flex-1 items-end bg-slate-50 p-2">
                        <span className="h-3 w-full rounded-full" style={{ background: theme.accent }} />
                      </span>
                    </span>
                    <span className="flex items-center justify-between px-3 py-2 text-sm font-medium text-[var(--pf-navy)]">
                      {theme.label}
                      {selected ? <span className="text-xs text-emerald-700">✓ Actual</span> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}

          {data && active === "pagos" ? (
            <div className="space-y-3">
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.paymentMethods.map((method) => (
                  <li key={method.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium text-[var(--pf-navy)]">{method.label}</span>{" "}
                      <span className="text-xs text-slate-400">({method.code})</span>
                    </span>
                    {!method.locked ? (
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        disabled={pending}
                        onClick={() => run(() => deleteSettingsPaymentMethod(method.id), "Método eliminado")}
                      >
                        Eliminar
                      </button>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Fijo</span>
                    )}
                  </li>
                ))}
              </ul>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void run(async () => {
                    await createSettingsPaymentMethod(methodLabel)
                    setMethodLabel("")
                  }, "Método creado")
                }}
              >
                <input
                  className="h-11 min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 text-sm"
                  placeholder="Nuevo método, por ejemplo Yape"
                  value={methodLabel}
                  onChange={(event) => setMethodLabel(event.target.value)}
                  required
                />
                <SaveButton pending={pending} color={current.color}>
                  Agregar
                </SaveButton>
              </form>
            </div>
          ) : null}

          {data && active === "sucursales" ? <PlacesPanel branches={data.branches} onChanged={reload} /> : null}

          {data && active === "almacenes" ? <PlacesPanel branches={data.branches} onChanged={reload} mode="warehouses" /> : null}

          {active === "unidades" ? <UnitsPage embedded /> : null}

          {data && active === "usuarios" ? <UsersPanel /> : null}

          {data && active === "impresion" ? <AssistantSettings /> : null}

          {data && active === "copias" ? (
            <div className="space-y-4">
              <BackupsPanel />
              <WipeDataPanel />
            </div>
          ) : null}

          {data && active === "lector" ? <ReaderSettings enabled={Boolean(data.hardwareReader)} onChanged={reload} /> : null}

          {data && active === "sistema" ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">Versión</dt>
                <dd className="font-semibold text-[var(--pf-navy)]">{data.versionLabel}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">Usuarios</dt>
                <dd className="font-semibold text-[var(--pf-navy)]">{data.users.length}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">Sucursales</dt>
                <dd className="font-semibold text-[var(--pf-navy)]">{data.branches.length}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <span className="mt-1 block font-normal">{children}</span>
    </label>
  )
}

function SaveButton({ pending, color, children }: { pending: boolean; color: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-xl px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60 sm:w-fit"
      style={{ background: color }}
    >
      {pending ? "Guardando…" : children}
    </button>
  )
}

function ImageSlot({
  title,
  description,
  url,
  round = false,
  pending,
  onPick,
  onRemove,
}: {
  title: string
  description: string
  url: string | null
  round?: boolean
  pending: boolean
  onPick: (file: File) => void
  onRemove: () => void
}) {
  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) onPick(file)
  }
  return (
    <div className="rounded-2xl border border-slate-200 p-3">
      <p className="font-semibold text-[var(--pf-navy)]">{title}</p>
      <p className="mb-3 text-xs text-slate-500">{description}</p>
      <div
        className={`grid place-items-center overflow-hidden bg-slate-100 ${round ? "mx-auto size-32 rounded-full" : "aspect-video w-full rounded-xl"}`}
      >
        {url ? (
          <img src={url} alt={title} className="size-full object-cover" />
        ) : (
          <span className="text-xs text-slate-400">Sin imagen</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <label
          className={`relative inline-flex h-10 cursor-pointer items-center overflow-hidden rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white shadow-sm ${
            pending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {url ? "Cambiar" : "Subir imagen"}
          <input type="file" accept="image/*" className="sr-only" onChange={onChange} disabled={pending} />
        </label>
        {url ? (
          <button
            type="button"
            disabled={pending}
            onClick={onRemove}
            className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Eliminar
          </button>
        ) : null}
      </div>
    </div>
  )
}
