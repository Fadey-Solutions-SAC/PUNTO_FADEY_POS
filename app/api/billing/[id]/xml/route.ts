import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getDocument } from "@/lib/billing";
import { requireTenant } from "@/lib/tenant";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await requireTenant();
  const { id } = await params;
  const document = await getDocument(ctx, id);
  return new NextResponse(document.xmlText, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename=${document.series}-${document.number}.xml`,
    },
  });
}
