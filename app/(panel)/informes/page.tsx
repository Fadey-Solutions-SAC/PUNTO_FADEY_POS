import Link from "next/link";
import BarChart3 from "lucide-react/icons/bar-chart-3";
import Boxes from "lucide-react/icons/boxes";
import ShoppingBag from "lucide-react/icons/shopping-bag";
import ShoppingCart from "lucide-react/icons/shopping-cart";
import Users from "lucide-react/icons/users";
import Wallet from "lucide-react/icons/wallet";
import { ReportTable } from "@/components/report-table";
import { Button, Card, Field, Forbidden, Select, actionLink } from "@/components/ui";
import { prisma } from "@/lib/db";
import { CASH_LABEL, MOVE_LABEL, PAYMENT_LABEL, PURCHASE_LABEL } from "@/lib/labels";
import { formatDate, formatMoney, formatQty } from "@/lib/money";
import { cashReport, customerReport, inventoryMovements, inventoryReport, parseRange, purchasesReport, salesReport } from "@/lib/reports";
import { can } from "@/lib/roles";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

const AREAS = [
  { id: "ventas", title: "Ventas", text: "Ingresos, operaciones, productos y medios de pago.", icon: ShoppingCart },
  { id: "compras", title: "Compras", text: "Compras, proveedores y costos.", icon: ShoppingBag },
  { id: "inventario", title: "Inventario", text: "Existencias, movimientos y valorización.", icon: Boxes },
  { id: "caja", title: "Caja", text: "Ingresos, egresos y cierres.", icon: Wallet },
  { id: "rentabilidad", title: "Rentabilidad", text: "Costos, utilidad bruta y márgenes.", icon: BarChart3 },
  { id: "clientes", title: "Clientes", text: "Compras, frecuencia y créditos.", icon: Users },
] as const;

type Area = (typeof AREAS)[number]["id"];

const GROUPS: Record<Area, { id: string; label: string }[]> = {
  ventas: [
    { id: "dia", label: "Por día" },
    { id: "usuario", label: "Por usuario" },
    { id: "producto", label: "Por producto" },
    { id: "categoria", label: "Por categoría" },
    { id: "pago", label: "Por medio de pago" },
  ],
  compras: [
    { id: "proveedor", label: "Por proveedor" },
    { id: "fecha", label: "Por fecha" },
    { id: "producto", label: "Por producto" },
    { id: "documentos", label: "Documentos" },
  ],
  inventario: [
    { id: "existencias", label: "Existencias" },
    { id: "entradas", label: "Entradas" },
    { id: "salidas", label: "Salidas" },
    { id: "transferencias", label: "Transferencias" },
    { id: "ajustes", label: "Ajustes" },
    { id: "vencimientos", label: "Próximos a vencer" },
  ],
  caja: [
    { id: "medios", label: "Medios de pago" },
    { id: "cierres", label: "Cierres" },
    { id: "movimientos", label: "Movimientos" },
  ],
  rentabilidad: [
    { id: "producto", label: "Por producto" },
    { id: "categoria", label: "Por categoría" },
    { id: "periodo", label: "Por período" },
  ],
  clientes: [
    { id: "compras", label: "Compras" },
    { id: "creditos", label: "Créditos" },
  ],
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireTenant();
  if (!can(ctx.role, "reports", ctx.grants)) return <Forbidden />;
  const query = await searchParams;
  const area = AREAS.some((item) => item.id === query.area) ? query.area as Area : null;
  if (!area) {
    return (
      <div>
        <p className="text-sm text-slate-500">Selecciona el área que deseas analizar.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {AREAS.map((item) => (
            <Link key={item.id} href={`/informes?area=${item.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--pf-shadow)] transition hover:border-[#c4a35a]">
              <item.icon className="text-primary" size={22} />
              <p className="mt-3 font-semibold text-navy">{item.title}</p>
              <p className="mt-1 text-sm text-slate-500">{item.text}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }
  const range = parseRange(query.desde, query.hasta);
  const from = dateInput(range.from);
  const to = dateInput(range.to);
  const group = GROUPS[area].some((item) => item.id === query.grupo) ? query.grupo! : GROUPS[area][0].id;
  const branchId = query.sucursal || undefined;
  const userId = query.usuario || undefined;
  const needsBranch = area === "ventas" || area === "caja" || area === "rentabilidad" || area === "clientes";
  const needsUser = area !== "inventario";
  const [branches, users] = needsUser
    ? await Promise.all([
        prisma.branch.findMany({ where: { businessId: ctx.businessId, isActive: true }, orderBy: { name: "asc" } }),
        prisma.user.findMany({ where: { email: { not: "configuracion@interno.fadey" }, memberships: { some: { businessId: ctx.businessId } } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ])
    : [[], []];
  const report = await loadReport(area, group, ctx, range, { branchId, userId });
  const params = new URLSearchParams({ area, grupo: group, desde: from, hasta: to });
  if (needsBranch && branchId) params.set("sucursal", branchId);
  if (needsUser && userId) params.set("usuario", userId);
  const info = AREAS.find((item) => item.id === area)!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/informes" className="text-sm text-primary">Todas las áreas</Link>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{info.title}. {report.description}</p>
        </div>
        <div className="flex gap-2">
          <a className={actionLink.secondary} href={`/api/reports/export?${params}&formato=xls`}>Excel</a>
          <a className={actionLink.secondary} href={`/api/reports/export?${params}&formato=pdf`}>PDF</a>
        </div>
      </div>
      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[var(--pf-shadow)] sm:grid-cols-2 lg:grid-cols-6">
        <input type="hidden" name="area" value={area} />
        <input type="hidden" name="grupo" value={group} />
        <label className="text-sm text-slate-600">Desde<Field className="mt-1" type="date" name="desde" defaultValue={from} /></label>
        <label className="text-sm text-slate-600">Hasta<Field className="mt-1" type="date" name="hasta" defaultValue={to} /></label>
        {needsBranch ? (
          <label className="text-sm text-slate-600">Sucursal
            <Select className="mt-1" name="sucursal" defaultValue={branchId ?? ""}>
              <option value="">Todas</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </label>
        ) : <p className="self-end text-sm text-slate-500">Almacén {ctx.warehouseName}</p>}
        {needsUser ? (
          <label className="text-sm text-slate-600">Usuario
            <Select className="mt-1" name="usuario" defaultValue={userId ?? ""}>
              <option value="">Todos</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select>
          </label>
        ) : null}
        <div className="flex items-end gap-2">
          <Button>Generar</Button>
          <Link href={`/informes?area=${area}`} className="text-sm text-slate-500">Limpiar</Link>
        </div>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {report.kpis.map((item) => (
          <Card key={item.label}>
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-1 text-xl font-semibold text-navy">{item.value}</p>
          </Card>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {GROUPS[area].map((item) => {
          const next = new URLSearchParams(params);
          next.set("grupo", item.id);
          const active = item.id === group;
          return (
            <Link key={item.id} href={`/informes?${next}`} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${active ? "bg-navy text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
              {item.label}
            </Link>
          );
        })}
      </div>
      <Card>
        <h2 className="font-semibold text-navy">{report.chartTitle}</h2>
        <Bars rows={report.chart} />
      </Card>
      <ReportTable columns={report.columns} rows={report.rows} />
    </div>
  );
}

function dateInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function Bars({ rows }: { rows: { label: string; value: number; text: string }[] }) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  if (rows.length === 0) return <p className="mt-4 text-sm text-slate-500">No hay datos suficientes para el gráfico.</p>;
  return (
    <div className="mt-4 space-y-2">
      {rows.slice(0, 8).map((row, index) => (
        <div key={`${row.label}-${index}`} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
          <span className="truncate text-slate-600">{row.label}</span>
          <span className="h-2 rounded-full bg-slate-100">
            <span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, (Math.abs(row.value) / max) * 100)}%` }} />
          </span>
          <span className="text-navy">{row.text}</span>
        </div>
      ))}
    </div>
  );
}

async function loadReport(
  area: Area,
  group: string,
  ctx: Awaited<ReturnType<typeof requireTenant>>,
  range: ReturnType<typeof parseRange>,
  filter: { branchId?: string; userId?: string },
) {
  if (area === "ventas") return salesView(await salesReport(ctx, range, filter), group, ctx.currency);
  if (area === "compras") return purchasesView(await purchasesReport(ctx, range, { userId: filter.userId }), group, ctx.currency);
  if (area === "inventario") return inventoryView(await inventoryReport(ctx), await inventoryMovements(ctx, range), group, ctx.currency);
  if (area === "caja") return cashView(await cashReport(ctx, range, filter), group, ctx.currency);
  if (area === "rentabilidad") return profitView(await salesReport(ctx, range, filter), group, ctx.currency);
  return customerView(await customerReport(ctx, range, filter), group, ctx.currency);
}

function moneyRows(entries: [string, number][], currency: string) {
  return {
    columns: ["Detalle", "Total"],
    rows: entries.map(([name, total]) => [name, formatMoney(total, currency)]),
    chart: entries.map(([label, value]) => ({ label, value, text: formatMoney(value, currency) })),
  };
}

function salesView(data: Awaited<ReturnType<typeof salesReport>>, group: string, currency: string) {
  const grouped = group === "usuario"
    ? moneyRows(data.byUser, currency)
    : group === "pago"
      ? moneyRows(data.byMethod.map(([method, total]) => [PAYMENT_LABEL[method] ?? method, total]), currency)
      : group === "producto"
        ? {
            columns: ["Producto", "Cantidad", "Venta", "Costo", "Utilidad bruta"],
            rows: data.byProduct.map(([name, row]) => [name, formatQty(row.qty), formatMoney(row.total, currency), formatMoney(row.cost, currency), formatMoney(row.total - row.cost, currency)]),
            chart: data.byProduct.map(([label, row]) => ({ label, value: row.total, text: formatMoney(row.total, currency) })),
          }
        : group === "categoria"
          ? {
              columns: ["Categoría", "Venta", "Costo", "Utilidad bruta"],
              rows: data.byCategory.map(([name, row]) => [name, formatMoney(row.total, currency), formatMoney(row.cost, currency), formatMoney(row.total - row.cost, currency)]),
              chart: data.byCategory.map(([label, row]) => ({ label, value: row.total, text: formatMoney(row.total, currency) })),
            }
          : {
              columns: ["Día", "Ventas", "Costo"],
              rows: data.byDay.map(([day, row]) => [day, formatMoney(row.total, currency), formatMoney(row.cost, currency)]),
              chart: data.byDay.map(([label, row]) => ({ label, value: row.total, text: formatMoney(row.total, currency) })),
            };
  return {
    description: "Ventas completadas del período, netas de devoluciones. La utilidad bruta es venta menos costo; no es utilidad neta.",
    chartTitle: GROUPS.ventas.find((item) => item.id === group)?.label ?? "Ventas",
    kpis: [
      { label: "Ventas", value: formatMoney(data.total, currency) },
      { label: "Operaciones", value: String(data.count) },
      { label: "Costo de ventas", value: formatMoney(data.cost, currency) },
      { label: "Utilidad bruta", value: formatMoney(data.gross, currency) },
      { label: "Ticket promedio", value: formatMoney(data.ticket, currency) },
    ],
    ...grouped,
  };
}

function purchasesView(data: Awaited<ReturnType<typeof purchasesReport>>, group: string, currency: string) {
  const grouped = group === "fecha"
    ? moneyRows(data.byDay, currency)
    : group === "producto"
      ? moneyRows(data.byProduct, currency)
      : group === "documentos"
        ? {
            columns: ["Fecha", "Proveedor", "Documento", "Total", "Pagado", "Estado"],
            rows: data.documents.map((item) => [formatDate(item.date), item.supplier, item.number, formatMoney(item.total, currency), formatMoney(item.paid, currency), PURCHASE_LABEL[item.status] ?? item.status]),
            chart: data.byDay.map(([label, value]) => ({ label, value, text: formatMoney(value, currency) })),
          }
        : moneyRows(data.bySupplier, currency);
  return {
    description: "Compras no anuladas del período. Por pagar es el total menos lo ya pagado.",
    chartTitle: GROUPS.compras.find((item) => item.id === group)?.label ?? "Compras",
    kpis: [
      { label: "Total comprado", value: formatMoney(data.total, currency) },
      { label: "Compras", value: String(data.count) },
      { label: "Proveedores", value: String(data.suppliers) },
      { label: "Pagado", value: formatMoney(data.paid, currency) },
      { label: "Por pagar", value: formatMoney(data.payable, currency) },
    ],
    ...grouped,
  };
}

function inventoryView(stock: Awaited<ReturnType<typeof inventoryReport>>, moves: Awaited<ReturnType<typeof inventoryMovements>>, group: string, currency: string) {
  const movementRows = (items: typeof moves.entries) => {
    const byType = new Map<string, number>();
    for (const item of items) {
      const label = MOVE_LABEL[item.type] ?? item.type;
      byType.set(label, (byType.get(label) ?? 0) + Math.abs(item.quantity));
    }
    return {
      columns: ["Fecha", "Producto", "Tipo", "Cantidad", "Usuario"],
      rows: items.map((item) => [formatDate(item.createdAt), item.product.name, MOVE_LABEL[item.type] ?? item.type, formatQty(item.quantity), item.user.name]),
      chart: [...byType.entries()].map(([label, value]) => ({ label, value, text: formatQty(value) })),
    };
  };
  const grouped = group === "entradas" ? movementRows(moves.entries)
    : group === "salidas" ? movementRows(moves.exits)
      : group === "transferencias" ? movementRows(moves.transfers)
        : group === "ajustes" ? movementRows(moves.adjustments)
          : group === "vencimientos"
            ? {
                columns: ["Producto", "Lote", "Vence", "Cantidad"],
                rows: stock.expiries.map((lot) => [lot.name, lot.code, lot.expiresAt ? formatDate(lot.expiresAt) : "—", formatQty(lot.quantity)]),
                chart: stock.expiries.map((lot) => ({ label: lot.name, value: lot.quantity, text: formatQty(lot.quantity) })),
              }
            : {
                columns: ["Producto", "Stock", "Estado", "Valor"],
                rows: stock.rows.map((row) => [row.name, formatQty(row.quantity), row.state, formatMoney(row.value, currency)]),
                chart: stock.rows.map((row) => ({ label: row.name, value: row.value, text: formatMoney(row.value, currency) })),
              };
  return {
    description: `Existencias del almacén activo. Hay ${stock.low.length} con stock bajo y ${stock.empty.length} agotados.`,
    chartTitle: GROUPS.inventario.find((item) => item.id === group)?.label ?? "Inventario",
    kpis: [
      { label: "Valor del inventario", value: formatMoney(stock.value, currency) },
      { label: "Productos", value: String(stock.rows.length) },
      { label: "Stock bajo", value: String(stock.low.length) },
      { label: "Agotados", value: String(stock.empty.length) },
      { label: "Con vencimiento", value: String(stock.expiries.length) },
    ],
    ...grouped,
  };
}

function cashView(data: Awaited<ReturnType<typeof cashReport>>, group: string, currency: string) {
  const grouped = group === "cierres"
    ? {
        columns: ["Cierre", "Caja", "Usuario", "Esperado", "Contado", "Diferencia"],
        rows: data.closed.map((item) => [item.closedAt ? formatDate(item.closedAt) : "—", item.register.name, item.user.name, formatMoney(item.expectedAmount ?? 0, currency), formatMoney(item.countedAmount ?? 0, currency), formatMoney(item.difference ?? 0, currency)]),
        chart: data.closed.map((item) => ({ label: item.register.name, value: item.difference ?? 0, text: formatMoney(item.difference ?? 0, currency) })),
      }
    : group === "movimientos"
      ? {
          columns: ["Fecha", "Tipo", "Usuario", "Motivo", "Monto"],
          rows: data.movements.map((item) => [formatDate(item.createdAt), CASH_LABEL[item.type] ?? item.type, item.user.name, item.reason, formatMoney(item.amount, currency)]),
          chart: data.movements.slice(0, 8).map((item) => ({ label: CASH_LABEL[item.type] ?? item.type, value: item.amount, text: formatMoney(item.amount, currency) })),
        }
      : moneyRows(data.sales.map(([method, total]) => [PAYMENT_LABEL[method] ?? method, total]), currency);
  return {
    description: "Los ingresos y egresos son movimientos de caja. Las ventas por medio de pago salen de las ventas completadas y no se suman a la utilidad.",
    chartTitle: GROUPS.caja.find((item) => item.id === group)?.label ?? "Caja",
    kpis: [
      { label: "Ingresos de caja", value: formatMoney(data.cashIn, currency) },
      { label: "Egresos de caja", value: formatMoney(data.cashOut, currency) },
      { label: "Aperturas", value: String(data.opened.length) },
      { label: "Cierres", value: String(data.closed.length) },
      { label: "Diferencia acumulada", value: formatMoney(data.closed.reduce((sum, item) => sum + (item.difference ?? 0), 0), currency) },
    ],
    ...grouped,
  };
}

function profitView(data: Awaited<ReturnType<typeof salesReport>>, group: string, currency: string) {
  const margin = data.total === 0 ? "—" : `${((data.gross / data.total) * 100).toFixed(1)} %`;
  const grouped = group === "categoria"
    ? {
        columns: ["Categoría", "Ventas", "Costo", "Utilidad bruta", "Margen bruto"],
        rows: data.byCategory.map(([name, row]) => [name, formatMoney(row.total, currency), formatMoney(row.cost, currency), formatMoney(row.total - row.cost, currency), row.total === 0 ? "—" : `${(((row.total - row.cost) / row.total) * 100).toFixed(1)} %`]),
        chart: data.byCategory.map(([label, row]) => ({ label, value: row.total - row.cost, text: formatMoney(row.total - row.cost, currency) })),
      }
    : group === "periodo"
      ? {
          columns: ["Día", "Ventas", "Costo", "Utilidad bruta"],
          rows: data.byDay.map(([day, row]) => [day, formatMoney(row.total, currency), formatMoney(row.cost, currency), formatMoney(row.total - row.cost, currency)]),
          chart: data.byDay.map(([label, row]) => ({ label, value: row.total - row.cost, text: formatMoney(row.total - row.cost, currency) })),
        }
      : {
          columns: ["Producto", "Ventas", "Costo", "Utilidad bruta", "Margen bruto"],
          rows: data.byProduct.map(([name, row]) => [name, formatMoney(row.total, currency), formatMoney(row.cost, currency), formatMoney(row.total - row.cost, currency), row.total === 0 ? "—" : `${(((row.total - row.cost) / row.total) * 100).toFixed(1)} %`]),
          chart: data.byProduct.map(([label, row]) => ({ label, value: row.total - row.cost, text: formatMoney(row.total - row.cost, currency) })),
        };
  return {
    description: "Utilidad bruta es la venta neta de devoluciones menos el costo registrado. No incluye gastos de caja ni es utilidad neta.",
    chartTitle: GROUPS.rentabilidad.find((item) => item.id === group)?.label ?? "Rentabilidad",
    kpis: [
      { label: "Ventas", value: formatMoney(data.total, currency) },
      { label: "Costos", value: formatMoney(data.cost, currency) },
      { label: "Utilidad bruta", value: formatMoney(data.gross, currency) },
      { label: "Margen bruto", value: margin },
    ],
    ...grouped,
  };
}

function customerView(data: Awaited<ReturnType<typeof customerReport>>, group: string, currency: string) {
  const grouped = group === "creditos"
    ? {
        columns: ["Cliente", "Saldo por cobrar"],
        rows: data.credits.map((customer) => [customer.name, formatMoney(customer.balance, currency)]),
        chart: data.credits.map((customer) => ({ label: customer.name, value: customer.balance, text: formatMoney(customer.balance, currency) })),
      }
    : {
        columns: ["Cliente", "Operaciones", "Compras"],
        rows: data.purchases.filter(([id]) => id !== "publico").map(([, row]) => [row.name, String(row.count), formatMoney(row.total, currency)]),
        chart: data.purchases.filter(([id]) => id !== "publico").map(([, row]) => ({ label: row.name, value: row.total, text: formatMoney(row.total, currency) })),
      };
  return {
    description: "Las compras salen de las ventas completadas del período. El saldo por cobrar es el crédito pendiente del cliente.",
    chartTitle: GROUPS.clientes.find((item) => item.id === group)?.label ?? "Clientes",
    kpis: [
      { label: "Clientes", value: String(data.totalCustomers) },
      { label: "Con compras", value: String(data.buyers) },
      { label: "Frecuentes", value: String(data.frequent.length) },
      { label: "Cuentas por cobrar", value: formatMoney(data.receivable, currency) },
    ],
    ...grouped,
  };
}
