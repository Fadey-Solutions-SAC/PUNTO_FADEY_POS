import { brandIconPng } from "@/lib/brand-icon"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ALLOWED = new Set([32, 48, 180, 192, 512])

export async function GET(_request: Request, context: { params: Promise<{ size: string }> }) {
  const { size: raw } = await context.params
  const size = Number.parseInt(raw, 10)
  if (!ALLOWED.has(size)) {
    return new NextResponse("Tamaño no válido", { status: 400 })
  }
  const body = await brandIconPng(size)
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300",
    },
  })
}
