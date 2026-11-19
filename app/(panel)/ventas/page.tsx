import { Suspense } from "react";
import { openCashAction } from "@/actions/operations";
import { SimpleForm } from "@/components/forms";
import { QuickSale } from "@/components/quick-sale";
import { Card, Field, Forbidden, Label, Select } from "@/components/ui";
import { currentSession } from "@/lib/cash";
import { loadCatalog } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatDate, formatMoney, fromMoneyInt, fromPercentInt } from "@/lib/money";
import { listPaymentMethods } from "@/lib/payment-methods";
import { readPosSettings } from "@/lib/pos-settings";
import { can } from "@/lib/roles";
import { readDraft } from "@/lib/sales";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function SalePage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const ctx = await requireTenant();
  const sell = can(ctx.role, "sell", ctx.grants);
  const cash = can(ctx.role, "cash", ctx.grants);
  if (!sell && !cash) return <Forbidden />;
  const { draft: draftId } = await searchParams;
  const session = await currentSession(ctx);

  if (!session) {
    const assigned = await prisma.membership.findUnique({
      where: { userId_businessId: { userId: ctx.userId, businessId: ctx.businessId } },
      select: { cashRegisterId: true },
    });
    const registers = cash
      ? await prisma.cashRegister.findMany({
          where: {
            businessId: ctx.businessId,
            branchId: ctx.branchId,
            isActive: true,
            ...(assigned?.cashRegisterId ? { id: assigned.cashRegisterId } : {}),
          },
          orderBy: { name: "asc" },
        })
      : [];
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <p className="text-sm text-slate-500">La caja está cerrada. Ábrela para vender y cobrar el día.</p>
        {cash ? (
          <Card>
            {registers.length === 0 ? (
              <p className="text-sm text-slate-500">{assigned?.cashRegisterId ? "Tu caja no está en esta sucursal." : "Esta sucursal todavía no tiene una caja."}</p>
            ) : (
              <SimpleForm action={openCashAction} submit="Abrir caja">
                <div>
                  <Label>Caja</Label>
                  <Select name="cashRegisterId">{registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}</Select>
                </div>
                <div><Label>Efectivo inicial</Label><Field name="openingAmount" defaultValue="0" required /></div>
              </SimpleForm>
            )}
          </Card>
        ) : (
          <Card><p className="text-sm text-slate-500">Pide a quien administra la caja que la abra para empezar a vender.</p></Card>
        )}
      </div>
    );
  }

  const [products, categories, customers, lists, draft, paymentMethods, posSettings] = sell
    ? await Promise.all([
        loadCatalog(ctx),
        prisma.category.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
        prisma.customer.findMany({ where: { businessId: ctx.businessId, isActive: true }, orderBy: { name: "asc" } }),
        prisma.priceList.findMany({ where: { businessId: ctx.businessId }, include: { items: true }, orderBy: { name: "asc" } }),
        draftId
          ? readDraft(ctx, draftId).catch((error: unknown) => {
              if (error instanceof AppError) return null;
              throw error;
            })
          : Promise.resolve(null),
        listPaymentMethods(ctx),
        readPosSettings(ctx.businessId),
      ])
    : [[], [], [], [], null, [], { hardwareReader: false }];

  const cashAccesses = [
    sell ? { href: "/ventas/pendientes", label: "Pendientes", icon: "pendientes" as const } : null,
    cash ? { href: "/caja/movimientos", label: "Movimientos", icon: "movimientos" as const } : null,
    cash ? { href: "/caja/ingresos", label: "Ingresos / egresos", icon: "ingresos" as const } : null,
    cash ? { href: "/caja/historial", label: "Historial", icon: "historial" as const } : null,
    can(ctx.role, "cashClose", ctx.grants) ? { href: "/caja/cierre", label: "Cierre", icon: "cierre" as const } : null,
  ].filter((item): item is { href: string; label: string; icon: "pendientes" | "movimientos" | "ingresos" | "historial" | "cierre" } => item !== null);

  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm text-slate-500">
        {session.register.name} abierta · {formatDate(session.openedAt)} · efectivo inicial {formatMoney(session.openingAmount, ctx.currency)}
      </p>
      {sell ? (
        <Suspense fallback={<p className="text-sm text-slate-500">Cargando venta…</p>}>
          <QuickSale
            products={products}
            categories={categories}
            customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))}
            lists={lists.map((list) => ({
              id: list.id,
              name: list.name,
              isDefault: list.isDefault,
              items: list.items.map((item) => ({
                productId: item.productId,
                presentationId: item.presentationId,
                price: fromMoneyInt(item.price).toFixed(2),
              })),
            }))}
            currency={ctx.currency}
            discountLimit={fromPercentInt(ctx.discountLimitPct).toNumber()}
            allowCredit={ctx.allowCredit}
            canCredit={can(ctx.role, "credit", ctx.grants)}
            sessionOpen
            paymentMethods={paymentMethods.map((method) => ({ value: method.code, label: method.label }))}
            hardwareReader={posSettings.hardwareReader}
            cashAccesses={cashAccesses}
            draft={draft ?? undefined}
          />
        </Suspense>
      ) : cashAccesses.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-navy">Accesos de caja</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {cashAccesses.map((item) => (
              <a key={item.href} href={item.href} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-medium text-navy">
                {item.label}
              </a>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
