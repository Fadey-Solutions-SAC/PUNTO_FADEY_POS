import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { AppError } from "@/lib/errors"

function key() {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) throw new AppError("Falta AUTH_SECRET para proteger credenciales")
  return createHash("sha256").update(secret).digest()
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, data]).toString("base64")
}

export function decryptSecret(payload: string) {
  const raw = Buffer.from(payload, "base64")
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const data = raw.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}
