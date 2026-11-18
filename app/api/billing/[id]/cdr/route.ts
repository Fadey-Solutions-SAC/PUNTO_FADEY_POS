import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getDocument } from "@/lib/billing";
import { requireTenant } from "@/lib/tenant";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await requireTenant();
  const { id } = await params;
  const document = await getDocument(ctx, id);
  if (!document.cdrText) return NextResponse.json({ error: "Este comprobante no tiene CDR" }, { status: 404 });
  return new NextResponse(document.cdrText, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename=${document.series}-${document.number}-cdr.txt`,
    },
  });
}
