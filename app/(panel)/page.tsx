import Link from "next/link";
import { Badge, Card, actionLink } from "@/components/ui";
import { summarizeSession } from "@/lib/cash";
import { dashboardData } from "@/lib/dashboard";
import { PAYMENT_LABEL } from "@/lib/labels";
import { formatMoney, formatQty } from "@/lib/money";
import { paymentMethodLabels } from "@/lib/payment-methods";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";
import PackagePlus from "lucide-react/icons/package-plus";
import ShoppingBag from "lucide-react/icons/shopping-bag";
import ShoppingCart from "lucide-react/icons/shopping-cart";
import Wallet from "lucide-react/icons/wallet";

export const instant = false;

const PAY_COLORS: Record<string, string> = {
  CASH: "#148a84",
  CARD: "#0c2340",
  TRANSFER: "#b45309",
  OTHER: "#64748b",
  CREDIT: "#0f5f73",
};

export default async function DashboardPage() {
  const ctx = await requireTenant();
  const [data, payLabels] = await Promise.all([dashboardData(ctx), paymentMethodLabels(ctx)]);
  const boxes = await Promise.all(data.openSessions.map((session) => summarizeSession(ctx, session.id)));
  const max = Math.max(...data.days.map((day) => Math.max(day.total, 0)), 1);
  const hasSalesChart = data.days.some((day) => day.total !== 0);
  const salesTrend = change(data.salesTotal, data.yesterdaySales);
  const opsTrend = change(data.operations, data.yesterdayOperations);
  const payTotal = Object.values(data.payMix).reduce((sum, value) => sum + value, 0);
  const sell = can(ctx.role, "sell", ctx.grants);
  const cash = can(ctx.role, "cash", ctx.grants);
  const purchases = can(ctx.role, "purchases", ctx.grants);
  const reports = can(ctx.role, "reports", ctx.grants);
  const shortcuts = [
    sell ? { href: "/ventas", label: "Nueva venta", icon: ShoppingCart, className: "pf-button" } : null,
    cash ? { href: "/ventas", label: "Apertura de caja", icon: Wallet, className: "bg-white text-navy" } : null,
    can(ctx.role, "catalogWrite", ctx.grants) ? { href: "/productos/nuevo", label: "Registrar producto", icon: PackagePlus, className: "bg-white text-navy" } : null,
    purchases ? { href: "/compras/recepcion", label: "Registrar compra", icon: ShoppingBag, className: "bg-white text-navy" } : null,
  ].filter((item): item is { href: string; label: string; icon: typeof ShoppingCart; className: string } => item !== null);
  const cards = [
    { label: "Ventas del día", value: formatMoney(data.salesTotal, ctx.currency), trend: salesTrend, tone: "text-primary" },
    { label: "Operaciones", value: String(data.operations), trend: opsTrend, tone: "text-navy" },
    { label: "Ingresos", value: formatMoney(data.income, ctx.currency), trend: null, tone: "text-ok" },
    { label: "Egresos", value: formatMoney(data.expense, ctx.currency), trend: null, tone: "text-red-700" },
    { label: "Ganancia estimada", value: formatMoney(data.profit, ctx.currency), trend: null, tone: "text-navy" },
    { label: "Productos", value: String(data.products), trend: null, tone: "text-navy" },
    { label: "Stock bajo", value: String(data.low), trend: null, tone: "text-warn" },
    { label: "Agotados", value: String(data.empty), trend: null, tone: "text-red-700" },
  ];

  return (
    <div className="space-y-4">
      {shortcuts.length > 0 ? (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {shortcuts.map((item) => (
          <Link key={item.label} href={item.href} className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium shadow-sm ${item.className}`}>
            <item.icon size={16} />
            {item.label}
          </Link>
        ))}
      </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${card.tone}`}>{card.value}</p>
            {card.trend ? <p className={`mt-1 text-xs font-medium ${card.trend.up ? "text-ok" : "text-red-700"}`}>{card.trend.text} vs. ayer</p> : null}
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)_minmax(16rem,0.8fr)]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-navy">Ventas de los últimos 7 días</h2>
            {reports ? <Link href="/informes" className={actionLink.ghost}>Informes</Link> : null}
          </div>
          {hasSalesChart ? (
            <div className="mt-4 flex h-44 items-end gap-2">
              {data.days.map((day) => (
                <div key={day.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] text-slate-400">{day.total > 0 ? formatMoney(day.total, ctx.currency) : ""}</span>
                  <div className="w-full rounded-t-lg bg-primary/90" style={{ height: `${Math.max(day.total > 0 ? 8 : 2, (Math.max(day.total, 0) / max) * 100)}%` }} />
                  <span className="text-[11px] capitalize text-slate-500">{day.label.replace(".", "")}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-8 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Aún no hay ventas en los últimos 7 días.</p>
          )}
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-navy">Estado de caja</h2>
            {sell || cash ? <Link href="/caja" className={actionLink.ghost}>Caja</Link> : null}
          </div>
          {boxes.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No hay cajas abiertas.</p> : (
            <ul className="mt-3 space-y-3">
              {boxes.map((box) => (
                <li key={box.session.id} className="rounded-xl bg-slate-50 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-navy">{box.session.register.name}</p>
                    <Badge tone="ok">Abierta</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{box.session.user.name}</p>
                  <dl className="mt-2 space-y-1 text-slate-600">
                    <div className="flex justify-between"><dt>Efectivo inicial</dt><dd>{formatMoney(box.session.openingAmount, ctx.currency)}</dd></div>
                    <div className="flex justify-between"><dt>Ventas en efectivo</dt><dd>{formatMoney(box.byMethod.CASH, ctx.currency)}</dd></div>
                    <div className="flex justify-between"><dt>Otros ingresos</dt><dd>{formatMoney(box.income, ctx.currency)}</dd></div>
                    <div className="flex justify-between"><dt>Egresos</dt><dd>{formatMoney(box.expense, ctx.currency)}</dd></div>
                    <div className="flex justify-between font-semibold text-navy"><dt>Saldo esperado</dt><dd>{formatMoney(box.expected, ctx.currency)}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold text-navy">Ventas por medio de pago</h2>
          <p className="text-xs text-slate-500">Cobros de las ventas completadas hoy.</p>
          {payTotal <= 0 ? <p className="mt-4 rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">Hoy todavía no hay cobros.</p> : (
            <div className="mt-4 flex items-center gap-4">
              <div
                className="grid size-28 shrink-0 place-items-center rounded-full"
                style={{ background: conic(data.payMix, payTotal) }}
              >
                <div className="grid size-16 place-items-center rounded-full bg-white text-center">
                  <span className="text-[10px] leading-tight text-slate-500">Total<br />{formatMoney(payTotal, ctx.currency)}</span>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {Object.entries(data.payMix).filter(([, value]) => value > 0).map(([method, value]) => (
                  <li key={method} className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: PAY_COLORS[method] }} />
                    <span className="flex-1">{payLabels[method] ?? PAYMENT_LABEL[method] ?? method}</span>
                    <span>{Math.round((value / payTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-navy">Últimas ventas</h2>
            {sell ? <Link href="/ventas/historial" className={actionLink.ghost}>Ver más</Link> : null}
          </div>
          {data.lastSales.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">Todavía no hay ventas.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="pb-2 font-medium">Venta</th><th className="pb-2 font-medium">Cliente</th><th className="pb-2 font-medium">Total</th><th className="pb-2 font-medium">Pago</th></tr>
                </thead>
                <tbody>
                  {data.lastSales.map((sale) => (
                    <tr key={sale.id} className="border-t border-slate-100">
                      <td className="py-2">{sell || reports ? <Link href={`/ventas/${sale.id}`}>{sale.id.slice(-6).toUpperCase()}</Link> : sale.id.slice(-6).toUpperCase()}</td>
                      <td className="py-2 text-slate-600">{sale.customer?.name ?? "Público"}</td>
                      <td className="py-2">{formatMoney(sale.total, ctx.currency)}</td>
                      <td className="py-2 text-slate-500">{sale.payments.map((payment) => payLabels[payment.method] ?? PAYMENT_LABEL[payment.method] ?? payment.method).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-navy">Productos con stock bajo</h2>
            <Link href="/inventario/alertas" className={actionLink.ghost}>Ver todos</Link>
          </div>
          {data.attention.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No hay alertas de stock en este almacén.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.attention.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate font-medium text-navy">{item.name}</span>
                  <span className="shrink-0 text-slate-500">{formatQty(item.quantity)} / mín. {formatQty(item.minStock)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-navy">Compras recientes</h2>
            {purchases ? <Link href="/compras/historial" className={actionLink.ghost}>Ver todas</Link> : null}
          </div>
          {data.lastPurchases.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">Todavía no hay compras.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.lastPurchases.map((purchase) => (
                <li key={purchase.id} className="flex items-center justify-between gap-3 py-2">
                  {purchases ? <Link href={`/compras/${purchase.id}`} className="truncate">{purchase.supplier.tradeName}</Link> : <span className="truncate">{purchase.supplier.tradeName}</span>}
                  <span className="shrink-0 text-slate-600">{formatMoney(purchase.total, ctx.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function change(current: number, previous: number) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.abs(pct).toFixed(1);
  return { up: pct >= 0, text: `${pct >= 0 ? "+" : "−"}${rounded}%` };
}

function conic(mix: Record<string, number>, total: number) {
  let cursor = 0;
  const stops = Object.entries(mix)
    .filter(([, value]) => value > 0)
    .map(([method, value]) => {
      const next = cursor + (value / total) * 100;
      const stop = `${PAY_COLORS[method] ?? "#94a3b8"} ${cursor}% ${next}%`;
      cursor = next;
      return stop;
    });
  return `conic-gradient(${stops.join(", ")})`;
}
