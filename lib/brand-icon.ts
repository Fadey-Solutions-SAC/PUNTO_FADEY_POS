import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { uploadsDir } from "@/lib/storage"

const DEFAULT_LOGO = path.join(process.cwd(), "public", "brand", "punto-fadey.jpg")

async function resolveBrandLogoPath() {
  const dir = uploadsDir()
  try {
    const names = await readdir(dir)
    const name = names.find((item) => /^brand-logo\.(jpg|png|webp)$/.test(item))
    if (name) {
      const file = path.join(dir, name)
      await stat(file)
      return file
    }
  } catch {
    // usa el logo por defecto del producto
  }
  return DEFAULT_LOGO
}

export async function brandIconPng(size: number) {
  const source = await resolveBrandLogoPath()
  const input = await readFile(source)
  return sharp(input)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toBuffer()
}
