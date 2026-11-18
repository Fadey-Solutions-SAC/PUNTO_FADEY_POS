import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createBackup } from "@/lib/backup";
import { requireTenant } from "@/lib/tenant";

export async function GET() {
  await connection();
  const ctx = await requireTenant();
  const backup = await createBackup(ctx);
  const bytes = await readFile(backup.target);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename=${backup.name}`,
    },
  });
}
