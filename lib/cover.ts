import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { AppError } from "@/lib/errors"
import { assertCan } from "@/lib/roles"
import { uploadsDir } from "@/lib/storage"
import type { TenantContext } from "@/lib/types"

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }

export async function loginCoverUrl() {
  const dir = uploadsDir()
  let names: string[] = []
  try {
    names = await readdir(dir)
  } catch {
    return null
  }
  const name = names.find((item) => /^login-cover\.(jpg|png|webp)$/.test(item))
  if (!name) return null
  const info = await stat(path.join(dir, name))
  return `/uploads/${name}?v=${Math.floor(info.mtimeMs)}`
}

export async function saveLoginCover(ctx: TenantContext, file: File) {
  assertCan(ctx, "settings")
  if (!file || file.size === 0) throw new AppError("Elige una imagen de portada")
  if (file.size > 5_000_000) throw new AppError("La portada supera 5 MB")
  const ext = EXTENSIONS[file.type]
  if (!ext) throw new AppError("Usa una imagen JPG, PNG o WebP")
  const dir = uploadsDir()
  await mkdir(dir, { recursive: true })
  const existing = await readdir(dir).catch(() => [] as string[])
  await Promise.all(
    existing.filter((item) => /^login-cover\.(jpg|png|webp)$/.test(item)).map((item) => unlink(path.join(dir, item))),
  )
  await writeFile(path.join(dir, `login-cover.${ext}`), Buffer.from(await file.arrayBuffer()))
}

export async function brandLogoUrl() {
  const dir = uploadsDir()
  let names: string[] = []
  try {
    names = await readdir(dir)
  } catch {
    return null
  }
  const name = names.find((item) => /^brand-logo\.(jpg|png|webp)$/.test(item))
  if (!name) return null
  const info = await stat(path.join(dir, name))
  return `/uploads/${name}?v=${Math.floor(info.mtimeMs)}`
}

export async function saveBrandLogo(ctx: TenantContext, file: File) {
  assertCan(ctx, "settings")
  if (!file || file.size === 0) throw new AppError("Elige una imagen de logo")
  if (file.size > 2_000_000) throw new AppError("El logo supera 2 MB")
  const ext = EXTENSIONS[file.type]
  if (!ext) throw new AppError("Usa una imagen JPG, PNG o WebP")
  const dir = uploadsDir()
  await mkdir(dir, { recursive: true })
  const existing = await readdir(dir).catch(() => [] as string[])
  await Promise.all(
    existing.filter((item) => /^brand-logo\.(jpg|png|webp)$/.test(item)).map((item) => unlink(path.join(dir, item))),
  )
  await writeFile(path.join(dir, `brand-logo.${ext}`), Buffer.from(await file.arrayBuffer()))
}
