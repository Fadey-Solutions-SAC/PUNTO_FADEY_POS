import { NextResponse } from "next/server";
import { connection } from "next/server";
import { excelXml, simplePdf } from "@/lib/export";
import { CASH_LABEL, MOVE_LABEL, PAYMENT_LABEL, PURCHASE_LABEL } from "@/lib/labels";
import { formatDate, formatMoney, formatQty } from "@/lib/money";
import { cashReport, customerReport, financeReport, inventoryMovements, inventoryReport, parseRange, purchasesReport, salesReport } from "@/lib/reports";
import { requireTenant } from "@/lib/tenant";

export async function GET(request: Request) {
  await connection();
  const ctx = await requireTenant();
  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("desde") ?? undefined, url.searchParams.get("hasta") ?? undefined);
  const format = url.searchParams.get("formato") ?? "xls";
  const area = url.searchParams.get("area");
  const vista = url.searchParams.get("vista");
  const group = url.searchParams.get("grupo") ?? "";
  const filter = { branchId: url.searchParams.get("sucursal") || undefined, userId: url.searchParams.get("usuario") || undefined };
  let title = "Informe";
  let headers = ["Detalle", "Valor"];
  const rows: string[][] = [];
  if (!area && vista === "finanzas") {
    const data = await financeReport(ctx, range);
    title = "Finanzas";
    rows.push(
      ["Ventas", formatMoney(data.sales, ctx.currency)],
      ["Ingresos de caja", formatMoney(data.cashIn, ctx.currency)],
      ["Utilidad bruta", formatMoney(data.gross, ctx.currency)],
      ["Utilidad neta", formatMoney(data.net, ctx.currency)],
      ["Por cobrar", formatMoney(data.receivable, ctx.currency)],
      ["Por pagar", formatMoney(data.payable, ctx.currency)],
    );
  } else if ((area ?? vista) === "compras") {
    const data = await purchasesReport(ctx, range, { userId: filter.userId });
    title = "Compras";
    rows.push(["Total comprado", formatMoney(data.total, ctx.currency)], ["Por pagar", formatMoney(data.payable, ctx.currency)]);
    const source = group === "fecha" ? data.byDay : group === "producto" ? data.byProduct : data.bySupplier;
    if (group === "documentos") {
      headers = ["Fecha", "Proveedor", "Documento", "Total", "Estado"];
      for (const item of data.documents) rows.push([formatDate(item.date), item.supplier, item.number, formatMoney(item.total, ctx.currency), PURCHASE_LABEL[item.status] ?? item.status]);
    } else for (const [name, total] of source) rows.push([name, formatMoney(total, ctx.currency)]);
  } else if ((area ?? vista) === "inventario") {
    const data = await inventoryReport(ctx);
    title = "Inventario";
    if (group === "vencimientos") {
      headers = ["Producto", "Lote", "Cantidad"];
      for (const lot of data.expiries) rows.push([lot.name, lot.code, formatQty(lot.quantity)]);
    } else if (group === "entradas" || group === "salidas" || group === "transferencias" || group === "ajustes") {
      const moves = await inventoryMovements(ctx, range);
      const list = group === "entradas" ? moves.entries : group === "salidas" ? moves.exits : group === "transferencias" ? moves.transfers : moves.adjustments;
      headers = ["Fecha", "Producto", "Tipo", "Cantidad"];
      for (const item of list) rows.push([formatDate(item.createdAt), item.product.name, MOVE_LABEL[item.type] ?? item.type, formatQty(item.quantity)]);
    } else {
      headers = ["Producto", "Estado", "Valor"];
      rows.push(["Valor del inventario", "", formatMoney(data.value, ctx.currency)]);
      for (const row of data.rows) rows.push([row.name, row.state, formatMoney(row.value, ctx.currency)]);
    }
  } else if (area === "caja") {
    const data = await cashReport(ctx, range, filter);
    title = "Caja";
    rows.push(["Ingresos de caja", formatMoney(data.cashIn, ctx.currency)], ["Egresos de caja", formatMoney(data.cashOut, ctx.currency)]);
    if (group === "cierres") {
      headers = ["Caja", "Esperado", "Contado", "Diferencia"];
      for (const item of data.closed) rows.push([item.register.name, formatMoney(item.expectedAmount ?? 0, ctx.currency), formatMoney(item.countedAmount ?? 0, ctx.currency), formatMoney(item.difference ?? 0, ctx.currency)]);
    } else if (group === "movimientos") {
      headers = ["Fecha", "Tipo", "Motivo", "Monto"];
      for (const item of data.movements) rows.push([formatDate(item.createdAt), CASH_LABEL[item.type] ?? item.type, item.reason, formatMoney(item.amount, ctx.currency)]);
    } else for (const [method, total] of data.sales) rows.push([PAYMENT_LABEL[method] ?? method, formatMoney(total, ctx.currency)]);
  } else if (area === "clientes") {
    const data = await customerReport(ctx, range, filter);
    title = "Clientes";
    rows.push(["Clientes", String(data.totalCustomers)], ["Con compras", String(data.buyers)], ["Por cobrar", formatMoney(data.receivable, ctx.currency)]);
    if (group === "creditos") for (const customer of data.credits) rows.push([customer.name, formatMoney(customer.balance, ctx.currency)]);
    else for (const [, row] of data.purchases) rows.push([row.name, formatMoney(row.total, ctx.currency)]);
  } else if (area === "rentabilidad") {
    const data = await salesReport(ctx, range, filter);
    title = "Rentabilidad";
    rows.push(["Ventas", formatMoney(data.total, ctx.currency)], ["Costo", formatMoney(data.cost, ctx.currency)], ["Utilidad bruta", formatMoney(data.gross, ctx.currency)]);
    const source = group === "categoria" ? data.byCategory : group === "periodo" ? data.byDay.map(([day, row]) => [day, row] as const) : data.byProduct;
    headers = ["Detalle", "Ventas", "Costo", "Utilidad bruta"];
    for (const [name, row] of source) rows.push([name, formatMoney(row.total, ctx.currency), formatMoney(row.cost, ctx.currency), formatMoney(row.total - row.cost, ctx.currency)]);
  } else {
    const data = await salesReport(ctx, range, filter);
    title = "Ventas";
    rows.push(["Ventas", formatMoney(data.total, ctx.currency)], ["Operaciones", String(data.count)], ["Costo", formatMoney(data.cost, ctx.currency)], ["Utilidad bruta", formatMoney(data.gross, ctx.currency)], ["Ticket promedio", formatMoney(data.ticket, ctx.currency)]);
    if (group === "usuario") for (const [name, total] of data.byUser) rows.push([name, formatMoney(total, ctx.currency)]);
    else if (group === "pago") for (const [method, total] of data.byMethod) rows.push([PAYMENT_LABEL[method] ?? method, formatMoney(total, ctx.currency)]);
    else if (group === "producto") {
      headers = ["Producto", "Cantidad", "Venta", "Costo"];
      for (const [name, row] of data.byProduct) rows.push([name, formatQty(row.qty), formatMoney(row.total, ctx.currency), formatMoney(row.cost, ctx.currency)]);
    } else if (group === "categoria") {
      headers = ["Categoría", "Venta", "Costo"];
      for (const [name, row] of data.byCategory) rows.push([name, formatMoney(row.total, ctx.currency), formatMoney(row.cost, ctx.currency)]);
    } else for (const [day, row] of data.byDay) rows.push([day, formatMoney(row.total, ctx.currency)]);
  }
  const file = title.toLowerCase();
  if (format === "pdf") {
    return new NextResponse(simplePdf(title, rows.map((row) => row.join("  "))), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename=informe-${file}.pdf` },
    });
  }
  return new NextResponse(excelXml(headers, rows), {
    headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": `attachment; filename=informe-${file}.xls` },
  });
}
