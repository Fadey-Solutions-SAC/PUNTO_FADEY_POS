import { NextResponse } from "next/server";
import { connection } from "next/server";
import { exportCatalogCsv } from "@/lib/catalog";
import { requireTenant } from "@/lib/tenant";

export async function GET() {
  await connection();
  const ctx = await requireTenant();
  const csv = await exportCatalogCsv(ctx);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=catalogo-punto-fadey.csv",
    },
  });
}
