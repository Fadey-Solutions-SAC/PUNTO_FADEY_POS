import { createBranchAction, createRegisterAction, createUserAction, deleteRegisterAction, deleteUserAction, saveCoverAction, saveLogoAction, updateBusinessAction, updateUserAction } from "@/actions/operations";
import { AppearancePicker } from "@/components/appearance-picker";
import { SimpleForm } from "@/components/forms";
import { NewBusinessForm } from "@/components/new-business";
import { HardwareReaderSettings } from "@/components/hardware-reader-settings";
import { PaymentMethodsSettings } from "@/components/payment-methods-settings";
import { PrintingSettings } from "@/components/printing-settings";
import { SettingsBoard, type SettingsItem } from "@/components/settings-board";
import { AuditSettings, BackupSettings, BillingSettings } from "@/components/settings-extra";
import { Card, Field, Forbidden, Label, PageHeader, Select } from "@/components/ui";
import { fromPercentInt } from "@/lib/money";
import { listPaymentMethods } from "@/lib/payment-methods";
import { readPosSettings } from "@/lib/pos-settings";
import { can, PERMISSIONS, PERMISSION_LABEL } from "@/lib/roles";
import { readTheme } from "@/lib/appearance";
import { brandLogoUrl, loginCoverUrl } from "@/lib/cover";
import { businessSnapshot } from "@/lib/settings";
import { requireTenant } from "@/lib/tenant";
import { APP_VERSION, formatAppVersion } from "@/lib/version";

export const instant = false;

export default async function SettingsPage() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "settings", ctx.grants)) return <Forbidden />;
  const [{ business, branches, users }, cover, logo, theme, paymentMethods, posSettings] = await Promise.all([
    businessSnapshot(ctx),
    loginCoverUrl(),
    brandLogoUrl(),
    readTheme(ctx.businessId),
    listPaymentMethods(ctx),
    readPosSettings(ctx.businessId),
  ]);
  const registers = branches.flatMap((branch) => branch.registers.filter((register) => register.isActive).map((register) => ({ ...register, branch })));
  const items: SettingsItem[] = [
    { id: "apariencia", group: "Apariencia", label: "Color" },
    { id: "logo", group: "Apariencia", label: "Logo" },
    { id: "portada", group: "Apariencia", label: "Portada" },
    { id: "negocio", group: "Negocio", label: "Datos del negocio" },
    { id: "pagos", group: "Negocio", label: "Métodos de pago" },
    { id: "sucursales", group: "Negocio", label: "Sucursales" },
    { id: "otro", group: "Negocio", label: "Otro negocio" },
    { id: "usuarios", group: "Equipo", label: "Usuarios" },
    { id: "cajas", group: "Equipo", label: "Cajas" },
  ];
  items.push({ id: "lector", group: "Sistema", label: "Lector" });
  items.push({ id: "impresion", group: "Sistema", label: "Impresión" });
  if (can(ctx.role, "billing", ctx.grants)) items.push({ id: "facturacion", group: "Sistema", label: "Facturación" });
  if (can(ctx.role, "backup", ctx.grants)) items.push({ id: "copia", group: "Sistema", label: "Copia" });
  items.push({ id: "auditoria", group: "Sistema", label: "Auditoría" });
  items.push({ id: "version", group: "Sistema", label: "Versión" });
  return (
    <div className="space-y-4">
      <PageHeader title="Configuración" description={`Estos datos pertenecen solo al negocio activo. · ${formatAppVersion()}`} />
      <SettingsBoard
        items={items}
        sections={{
          apariencia: (
      <Card>
        <h2 className="mb-1 font-medium">Apariencia</h2>
        <p className="mb-3 text-sm text-slate-500">El color cambia el panel lateral, la barra superior y los botones.</p>
        <AppearancePicker current={theme} />
      </Card>
          ),
          logo: (
      <Card>
        <h2 className="mb-1 font-medium">Logo</h2>
        <p className="mb-3 text-sm text-slate-500">Esta imagen se muestra en el inicio de sesión y en la barra del sistema. JPG, PNG o WebP de hasta 2 MB.</p>
        <img src={logo ?? "/brand/punto-fadey.jpg"} alt="Logo actual" className="mb-3 size-24 rounded-full object-cover" />
        <SimpleForm action={saveLogoAction} submit="Guardar logo" encType="multipart/form-data">
          <Field name="logo" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp" required />
        </SimpleForm>
      </Card>
          ),
          portada: (
      <Card>
        <h2 className="mb-1 font-medium">Portada de inicio</h2>
        <p className="mb-3 text-sm text-slate-500">Esta imagen se muestra detrás del inicio de sesión. JPG, PNG o WebP de hasta 5 MB.</p>
        {cover ? <img src={cover} alt="Portada actual" className="mb-3 h-36 w-full rounded-xl object-cover" /> : <p className="mb-3 text-sm text-slate-500">Todavía no hay una portada. El inicio de sesión usa un fondo oscuro.</p>}
        <SimpleForm action={saveCoverAction} submit="Guardar portada" encType="multipart/form-data">
          <Field name="cover" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp" required />
        </SimpleForm>
      </Card>
          ),
          negocio: (
      <Card>
        <h2 className="mb-3 font-medium">Negocio</h2>
        <SimpleForm action={updateBusinessAction} submit="Guardar">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Nombre</Label><Field name="name" defaultValue={business.name} required /></div>
            <div><Label>Razón social</Label><Field name="legalName" defaultValue={business.legalName ?? ""} /></div>
            <div><Label>Documento</Label><Field name="taxId" defaultValue={business.taxId ?? ""} /></div>
            <div><Label>Moneda</Label><Field name="currency" defaultValue={business.currency} /></div>
            <div><Label>Tope de descuento %</Label><Field name="discountLimitPct" defaultValue={fromPercentInt(business.discountLimitPct).toFixed(2)} /></div>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" name="allowCredit" defaultChecked={business.allowCredit} /> Permitir ventas a crédito
            </label>
          </div>
        </SimpleForm>
      </Card>
          ),
          pagos: <PaymentMethodsSettings methods={paymentMethods} />,
          sucursales: (
      <Card>
        <h2 className="mb-3 font-medium">Sucursales</h2>
        <ul className="mb-3 text-sm">
          {branches.map((branch) => (
            <li key={branch.id}>{branch.name} · {branch.warehouses.length} almacenes</li>
          ))}
        </ul>
        <SimpleForm action={createBranchAction} submit="Crear sucursal">
          <Field name="name" required placeholder="Sucursal" />
          <Field name="address" placeholder="Dirección" />
        </SimpleForm>
      </Card>
          ),
          usuarios: (
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Usuarios</h2>
          {can(ctx.role, "users", ctx.grants) ? (
            <details className="w-full sm:w-auto">
              <summary className="cursor-pointer list-none">
                <span className="pf-button inline-flex h-10 items-center rounded-xl px-3.5 text-sm font-medium">Crear usuario</span>
              </summary>
              <div className="mt-3 rounded-2xl border border-slate-200 p-3">
                <SimpleForm action={createUserAction} submit="Guardar usuario">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field name="name" required placeholder="Nombre" />
                    <Field name="username" required placeholder="Usuario" autoComplete="off" />
                    <Field name="password" type="password" required minLength={8} placeholder="Contraseña" autoComplete="new-password" />
                  </div>
                  <label className="block text-sm text-slate-600">Caja
                    <Select className="mt-1" name="cashRegisterId" defaultValue={registers[0]?.id ?? ""}>
                      <option value="">Sin caja</option>
                      {registers.map((register) => <option key={register.id} value={register.id}>{register.branch.name} · {register.name}</option>)}
                    </Select>
                  </label>
                  <PermissionChecks selected={["sell", "cash", "cashClose", "returnSale", "customers"]} />
                </SimpleForm>
              </div>
            </details>
          ) : null}
        </div>
        <ul className="divide-y divide-slate-100">
          {users.map((member) => {
            const selected = new Set(member.user.permissions.map((item) => item.permission));
            return (
              <li key={member.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-navy">{member.user.name}</p>
                    <p className="text-sm text-slate-500">{member.user.username ?? member.user.email} · {member.register?.name ?? "Sin caja"}</p>
                  </div>
                  {can(ctx.role, "users", ctx.grants) && member.role !== "OWNER" ? (
                    <SimpleForm action={deleteUserAction} submit="Eliminar">
                      <input type="hidden" name="userId" value={member.userId} />
                    </SimpleForm>
                  ) : null}
                </div>
                {can(ctx.role, "users", ctx.grants) ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-primary">{member.role === "OWNER" ? "Datos y caja" : "Datos, caja y permisos"}</summary>
                    <div className="mt-3">
                      <SimpleForm action={updateUserAction} submit="Guardar">
                        <input type="hidden" name="userId" value={member.userId} />
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field name="name" required defaultValue={member.user.name} placeholder="Nombre" />
                          <Field name="username" required defaultValue={member.user.username ?? ""} placeholder="Usuario" />
                          <Field name="password" type="password" minLength={8} placeholder="Nueva contraseña" autoComplete="new-password" />
                        </div>
                        <label className="block text-sm text-slate-600">Caja
                          <Select className="mt-1" name="cashRegisterId" defaultValue={member.cashRegisterId ?? ""}>
                            <option value="">Sin caja</option>
                            {registers.map((register) => <option key={register.id} value={register.id}>{register.branch.name} · {register.name}</option>)}
                          </Select>
                        </label>
                        {member.role === "OWNER" ? <p className="text-sm text-slate-500">El dueño conserva todos los permisos.</p> : <PermissionChecks selected={[...selected]} />}
                      </SimpleForm>
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
          ),
          cajas: (
      <Card>
        <h2 className="mb-1 font-medium">Cajas</h2>
        <p className="mb-3 text-sm text-slate-500">Cada usuario con caja solo abre la que tiene asignada. La primera caja de una sucursal se crea sola.</p>
        <ul className="mb-3 divide-y divide-slate-100 text-sm">
          {registers.length === 0 ? <li className="text-slate-500">No hay cajas activas.</li> : registers.map((register) => (
            <li key={register.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{register.branch.name} · {register.name}</span>
              <SimpleForm action={deleteRegisterAction} submit="Eliminar">
                <input type="hidden" name="registerId" value={register.id} />
              </SimpleForm>
            </li>
          ))}
        </ul>
        <SimpleForm action={createRegisterAction} submit="Crear caja">
          <Field name="name" required placeholder="Nombre de la caja" />
        </SimpleForm>
      </Card>
          ),
          lector: <HardwareReaderSettings enabled={posSettings.hardwareReader} />,
          impresion: <PrintingSettings />,
          ...(can(ctx.role, "billing", ctx.grants) ? { facturacion: <BillingSettings ctx={ctx} /> } : {}),
          ...(can(ctx.role, "backup", ctx.grants) ? { copia: <BackupSettings /> } : {}),
          auditoria: <AuditSettings ctx={ctx} />,
          version: (
      <Card>
        <h2 className="mb-1 font-medium">Versión del sistema</h2>
        <p className="mb-3 text-sm text-slate-500">Se actualiza con cada despliegue de Punto Fadey (A.B.C.D, cada dígito de 0 a 9).</p>
        <p className="text-2xl font-semibold tracking-wide text-[var(--pf-navy)]">{formatAppVersion(APP_VERSION)}</p>
      </Card>
          ),
          otro: (
      <Card>
        <h2 className="mb-3 font-medium">Otro negocio</h2>
        <p className="mb-3 text-sm text-slate-500">Crea un negocio independiente. No comparte productos, ventas ni stock con este.</p>
        <NewBusinessForm />
      </Card>
          ),
        }}
      />
    </div>
  );
}

function PermissionChecks({ selected }: { selected: string[] }) {
  const on = new Set(selected);
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-1 text-sm text-slate-600">Permisos</legend>
      <p className="mb-1 text-xs text-slate-500 sm:col-span-2">Crear usuarios y cambiar permisos queda solo en el dueño.</p>
      {PERMISSIONS.filter((permission) => permission !== "users" && permission !== "permissions").map((permission) => (
        <label key={permission} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="permission" value={permission} defaultChecked={on.has(permission)} />
          {PERMISSION_LABEL[permission]}
        </label>
      ))}
    </fieldset>
  );
}
