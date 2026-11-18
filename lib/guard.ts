import { createHash, timingSafeEqual } from "node:crypto"
import { headers } from "next/headers"
import { AppError } from "@/lib/errors"

const CODE_PATTERN = /[<>{}\\`;]|javascript\s*:|<\s*script/i
const PASSWORD_HASH = "399f2a990a33b3cbf8432568937c9bfd6afaa7c3ec37c0b8056145f2ac32a76c"

type Bucket = { count: number; reset: number }
const buckets = new Map<string, Bucket>()

export function assertNoCode(value: string) {
  if (CODE_PATTERN.test(value)) throw new AppError("No se permiten caracteres de código")
}

export function configPasswordOk(password: string) {
  const digest = createHash("sha256").update(password).digest()
  const expected = Buffer.from(PASSWORD_HASH, "hex")
  if (digest.length !== expected.length) return false
  return timingSafeEqual(digest, expected)
}

async function clientKey() {
  const requestHeaders = await headers()
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "local"
}

export async function assertAttempts(scope: string, limit: number, windowMs: number) {
  const key = `${scope}:${await clientKey()}`
  const now = Date.now()
  const bucket = buckets.get(key)
  if (bucket && bucket.reset > now && bucket.count >= limit) {
    throw new AppError("Demasiados intentos. Espera unos minutos y vuelve a probar.")
  }
}

export async function noteAttempt(scope: string, windowMs: number) {
  const key = `${scope}:${await clientKey()}`
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.reset <= now) buckets.set(key, { count: 1, reset: now + windowMs })
  else bucket.count += 1
}

export async function clearAttempts(scope: string) {
  buckets.delete(`${scope}:${await clientKey()}`)
}
