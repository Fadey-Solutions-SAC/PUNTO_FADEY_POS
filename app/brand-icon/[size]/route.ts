import { brandIconPng } from "@/lib/brand-icon"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"

const ALLOWED = new Set([32, 48, 180, 192, 512])

const STATIC_FALLBACK: Record<number, string> = {
  32: "icon-32.png",
  48: "icon-48.png",
  180: "icon-180.png",
  192: "icon-192.png",
  512: "icon-512.png",
}

async function staticIcon(size: number) {
  const name = STATIC_FALLBACK[size] ?? "icon-192.png"
  return readFile(path.join(process.cwd(), "public", "icons", name))
}

export async function GET(_request: Request, context: { params: Promise<{ size: string }> }) {
  const { size: raw } = await context.params
  const size = Number.parseInt(raw, 10)
  if (!ALLOWED.has(size)) {
    return new NextResponse("Tamaño no válido", { status: 400 })
  }
  try {
    const body = await brandIconPng(size)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    })
  } catch {
    const body = await staticIcon(size)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    })
  }
}
