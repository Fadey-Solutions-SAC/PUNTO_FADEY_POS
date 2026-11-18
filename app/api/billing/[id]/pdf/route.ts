import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getDocument } from "@/lib/billing";
import { readAssistantDocument } from "@/lib/billing-assistant";
import { requireTenant } from "@/lib/tenant";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await requireTenant();
  const { id } = await params;
  const document = await getDocument(ctx, id);
  const extra = await readAssistantDocument(ctx, document.id);
  if (!extra?.pdfBase64) return NextResponse.json({ error: "Este comprobante no tiene PDF" }, { status: 404 });
  return new NextResponse(Buffer.from(extra.pdfBase64, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${document.series}-${document.number}.pdf`,
    },
  });
}
