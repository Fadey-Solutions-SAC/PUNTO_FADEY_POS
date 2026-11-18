import { readFile } from "node:fs/promises"
import path from "node:path"
import { connection, NextResponse } from "next/server"
import { uploadsDir } from "@/lib/storage"

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  await connection()
  const { name } = await params
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return new NextResponse(null, { status: 404 })
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  const type = TYPES[ext]
  if (!type) return new NextResponse(null, { status: 404 })
  try {
    const bytes = await readFile(path.join(uploadsDir(), name))
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600" },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
