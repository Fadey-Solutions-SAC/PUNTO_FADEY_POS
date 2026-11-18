import Link from "next/link";
import { wipeDataAction } from "@/actions/operations";
import { saveAssistantBillingAction } from "@/actions/assistant";
import { saveBillingAction, saveSeriesAction } from "@/actions/part2";
import { readAssistantBilling } from "@/lib/billing-assistant";
import { SimpleForm } from "@/components/forms";
import { WipeDataForm } from "@/components/wipe-data";
import { Card, Field, Label, Select, actionLink } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/money";
import type { TenantContext } from "@/lib/types";

export async function BillingSettings({ ctx }: { ctx: TenantContext }) {
  const [profile, series, local] = await Promise.all([
    prisma.billingProfile.findUnique({ where: { businessId: ctx.businessId } }),
    prisma.documentSeries.findMany({ where: { businessId: ctx.businessId } }),
    readAssistantBilling(ctx),
  ]);
  return (
    <div className="space-y-4">
        <Card>
          <h2 className="mb-1 font-medium">SUNAT por el asistente local</h2>
          <p className="mb-3 text-sm text-slate-500">
            El asistente de la PC de caja firma la boleta o factura con tu certificado y la envía a SUNAT. La clave SOL, el certificado y su contraseña se guardan cifrados y solo se entregan al asistente al emitir. El RUC y la razón social salen de Datos del negocio.
          </p>
          <SimpleForm action={saveAssistantBillingAction} submit="Guardar datos SUNAT" encType="multipart/form-data">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Nombre comercial</Label><Field name="tradeName" defaultValue={local.tradeName} placeholder="Como aparece en el ticket" /></div>
              <div><Label>Ubigeo</Label><Field name="ubigeo" defaultValue={local.ubigeo} placeholder="150101" inputMode="numeric" /></div>
              <div className="sm:col-span-2"><Label>Dirección fiscal</Label><Field name="address" defaultValue={local.address} /></div>
              <div><Label>Departamento</Label><Field name="department" defaultValue={local.department} /></div>
              <div><Label>Provincia</Label><Field name="province" defaultValue={local.province} /></div>
              <div><Label>Distrito</Label><Field name="district" defaultValue={local.district} /></div>
              <div><Label>Teléfono</Label><Field name="phone" defaultValue={local.phone} /></div>
              <div className="sm:col-span-2"><Label>Correo</Label><Field name="email" type="email" defaultValue={local.email} /></div>
              <div><Label>Usuario SOL</Label><Field name="solUser" defaultValue={local.solUser} autoComplete="off" /></div>
              <div><Label>Clave SOL</Label><Field name="solPassword" type="password" autoComplete="new-password" placeholder={local.hasSolPassword ? "Guardada. Escribe otra para cambiarla" : "Clave SOL"} /></div>
              <div><Label>Certificado digital (.pfx)</Label><Field name="cert" type="file" accept=".pfx,.p12" /></div>
              <div><Label>Contraseña del certificado</Label><Field name="certPassword" type="password" autoComplete="new-password" placeholder={local.hasCertPassword ? "Guardada. Escribe otra para cambiarla" : "Contraseña"} /></div>
            </div>
            <p className="text-xs text-slate-500">{local.certName ? `Certificado guardado: ${local.certName}` : "Todavía no hay certificado."} El ambiente (pruebas o producción) se elige abajo.</p>
          </SimpleForm>
        </Card>
        <Card>
          <h2 className="mb-3 font-medium">Proveedor externo y series</h2>
          <p className="mb-3 text-sm text-slate-500">Opcional si usas el asistente local. El token se guarda cifrado. El ambiente y el IGV valen para los dos caminos.</p>
          <SimpleForm action={saveBillingAction} submit="Guardar proveedor">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>URL del proveedor</Label><Field name="endpoint" defaultValue={profile?.endpoint ?? ""} placeholder="https://..." /></div>
              <div><Label>Token</Label><Field name="token" type="password" placeholder={profile?.tokenCipher ? "Guardado. Escribe otro para reemplazarlo" : "Token"} /></div>
              <div>
                <Label>Ambiente</Label>
                <Select name="environment" defaultValue={profile?.environment ?? "beta"}>
                  <option value="beta">Pruebas</option>
                  <option value="prod">Producción</option>
                </Select>
              </div>
              <div><Label>IGV %</Label><Field name="igvRate" defaultValue={((profile?.igvRate ?? 1800) / 100).toFixed(2)} /></div>
            </div>
          </SimpleForm>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["FACTURA", "BOLETA", "NOTA_CREDITO", "NOTA_DEBITO"] as const).map((docType) => (
              <SimpleForm key={docType} action={saveSeriesAction} submit="Guardar serie">
                <input type="hidden" name="docType" value={docType} />
                <Label>{docType}</Label>
                <Field name="series" defaultValue={series.find((item) => item.docType === docType)?.series ?? ""} placeholder={{ FACTURA: "F001", BOLETA: "B001", NOTA_CREDITO: "FC01", NOTA_DEBITO: "FD01" }[docType]} />
              </SimpleForm>
            ))}
          </div>
        </Card>
    </div>
  );
}

export function BackupSettings() {
  return (
        <Card>
          <h2 className="mb-3 font-medium">Copia de seguridad</h2>
          <p className="mb-3 text-sm text-slate-500">Descarga el único archivo de la base. Para restaurar, detén la aplicación y reemplaza ese archivo. En Render es el que indica DB_PATH.</p>
          <Link href="/api/backup" className={actionLink.primary}>Descargar copia</Link>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="mb-1 font-medium text-red-700">Borrar todos los datos</h3>
            <p className="mb-3 text-sm text-slate-500">Vacía el negocio por completo. Solo pide la contraseña de configuración, sin usuario. Descarga una copia antes si vas a necesitar estos datos.</p>
            <WipeDataForm action={wipeDataAction} />
          </div>
        </Card>
  );
}

export async function AuditSettings({ ctx }: { ctx: TenantContext }) {
  const audits = await prisma.auditLog.findMany({ where: { businessId: ctx.businessId }, orderBy: { createdAt: "desc" }, take: 20, include: { user: true } });
  return (
        <Card>
          <h2 className="mb-3 font-medium">Auditoría</h2>
          <ul className="space-y-1 text-sm">
            {audits.length === 0 ? <li className="text-slate-500">Todavía no hay eventos.</li> : audits.map((item) => (
              <li key={item.id}>{formatDate(item.createdAt)} · {item.user?.name ?? "Sistema"} · {item.action}</li>
            ))}
          </ul>
        </Card>
  );
}
