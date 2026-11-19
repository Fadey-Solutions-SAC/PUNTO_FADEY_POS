import { cookies } from "next/headers"
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  createSessionToken,
  verifySessionToken,
  type SessionToken,
} from "@/lib/session-core"

export { SESSION_COOKIE, type SessionToken }

export async function signSession(session: SessionToken) {
  const token = await createSessionToken(session)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS)
}

export async function clearSession() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

export async function readSession(): Promise<SessionToken | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}
