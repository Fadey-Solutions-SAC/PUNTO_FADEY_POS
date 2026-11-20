import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { AppError } from "@/lib/errors"
import { assertCan } from "@/lib/roles"
import { uploadsDir } from "@/lib/storage"
import type { TenantContext } from "@/lib/types"

/**
 * Logo y portada de inicio, uno por negocio: `brand-logo-<negocio>.jpg`, `login-cover-<negocio>.jpg`
 * en la carpeta uploads del disco. Si un negocio aún no subió el suyo, se usa el archivo antiguo
 * compartido (`brand-logo.jpg`, `login-cover.jpg`) para no perder lo que ya estaba configurado.
 */

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

const COVER_MAX_BYTES = 5_000_000
const LOGO_MAX_BYTES = 2_000_000

type Kind = "brand-logo" | "login-cover"

function extensionFor(file: File) {
  const byType = EXTENSIONS[file.type]
  if (byType) return byType
  const name = file.name.toLowerCase()
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg"
  if (name.endsWith(".png")) return "png"
  if (name.endsWith(".webp")) return "webp"
  return null
}

function safeId(businessId: string) {
  return businessId.replace(/[^a-zA-Z0-9_-]/g, "")
}

function pattern(kind: Kind, businessId?: string) {
  const suffix = businessId ? `-${safeId(businessId)}` : ""
  return new RegExp(`^${kind}${suffix}\\.(jpg|png|webp)$`)
}

async function findUrl(kind: Kind, businessId?: string) {
  const dir = uploadsDir()
  let names: string[] = []
  try {
    names = await readdir(dir)
  } catch {
    return null
  }
  const own = businessId ? names.find((item) => pattern(kind, businessId).test(item)) : undefined
  const name = own ?? names.find((item) => pattern(kind).test(item))
  if (!name) return null
  const info = await stat(path.join(dir, name))
  return `/uploads/${name}?v=${Math.floor(info.mtimeMs)}`
}

async function saveImage(ctx: TenantContext, kind: Kind, file: File, maxBytes: number, label: string) {
  assertCan(ctx, "settings")
  if (!file || file.size === 0) throw new AppError(`Elige una imagen de ${label}`)
  if (file.size > maxBytes) {
    throw new AppError(`La imagen de ${label} supera ${Math.round(maxBytes / 1_000_000)} MB. Usa una más liviana.`)
  }
  const ext = extensionFor(file)
  if (!ext) throw new AppError("Usa una imagen JPG, PNG o WebP")
  const dir = uploadsDir()
  await mkdir(dir, { recursive: true })
  const existing = await readdir(dir).catch(() => [] as string[])
  const mine = pattern(kind, ctx.businessId)
  await Promise.all(existing.filter((item) => mine.test(item)).map((item) => unlink(path.join(dir, item))))
  await writeFile(path.join(dir, `${kind}-${safeId(ctx.businessId)}.${ext}`), Buffer.from(await file.arrayBuffer()))
}

async function removeImage(ctx: TenantContext, kind: Kind) {
  assertCan(ctx, "settings")
  const dir = uploadsDir()
  const existing = await readdir(dir).catch(() => [] as string[])
  const mine = pattern(kind, ctx.businessId)
  await Promise.all(existing.filter((item) => mine.test(item)).map((item) => unlink(path.join(dir, item))))
}

export function loginCoverUrl(businessId?: string) {
  return findUrl("login-cover", businessId)
}

export function brandLogoUrl(businessId?: string) {
  return findUrl("brand-logo", businessId)
}

export function saveLoginCover(ctx: TenantContext, file: File) {
  return saveImage(ctx, "login-cover", file, COVER_MAX_BYTES, "portada")
}

export function saveBrandLogo(ctx: TenantContext, file: File) {
  return saveImage(ctx, "brand-logo", file, LOGO_MAX_BYTES, "logo")
}

export function removeLoginCover(ctx: TenantContext) {
  return removeImage(ctx, "login-cover")
}

export function removeBrandLogo(ctx: TenantContext) {
  return removeImage(ctx, "brand-logo")
}
