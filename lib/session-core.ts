import { SignJWT, jwtVerify } from "jose"

export const SESSION_COOKIE = "fadey_session"

export type SessionToken = {
  userId: string
  name: string
  email: string
  businessId: string
  branchId: string
  warehouseId: string
  configMode?: boolean
}

function secret() {
  const value = process.env.AUTH_SECRET
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET no está configurado")
  }
  return new TextEncoder().encode(value)
}

/** Firma JWT (Next y Express). */
export async function createSessionToken(session: SessionToken) {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret())
}

export async function verifySessionToken(token: string): Promise<SessionToken | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    const userId = String(payload.userId ?? "")
    const businessId = String(payload.businessId ?? "")
    const branchId = String(payload.branchId ?? "")
    const warehouseId = String(payload.warehouseId ?? "")
    if (!userId || !businessId || !branchId || !warehouseId) return null
    return {
      userId,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      businessId,
      branchId,
      warehouseId,
      configMode: payload.configMode === true,
    }
  } catch {
    return null
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 14,
}
