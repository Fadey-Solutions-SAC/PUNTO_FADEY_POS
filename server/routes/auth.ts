import type { Express, Request, Response } from "express"
import { errorMessage } from "../../lib/errors"
import { assertAttempts, assertNoCode, clearAttempts, configPasswordOk, noteAttempt, runWithClientIp } from "../../lib/guard"
import { businessCount, authenticate, openConfigSession } from "../../lib/setup"
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  createSessionToken,
  verifySessionToken,
  type SessionToken,
} from "../../lib/session-core"
import { prisma } from "../../lib/db"
import { isRole } from "../../lib/roles"

function clientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"]
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0]?.trim() || "local"
  return req.socket.remoteAddress || "local"
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
    sameSite: SESSION_COOKIE_OPTIONS.sameSite,
    secure: SESSION_COOKIE_OPTIONS.secure,
    path: SESSION_COOKIE_OPTIONS.path,
    maxAge: SESSION_COOKIE_OPTIONS.maxAge * 1000,
  })
}

async function readReqSession(req: Request): Promise<SessionToken | null> {
  const raw = req.cookies?.[SESSION_COOKIE]
  if (!raw || typeof raw !== "string") return null
  return verifySessionToken(raw)
}

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/bootstrap", async (_req, res) => {
    try {
      const businesses = await businessCount()
      res.json({ needsSetup: businesses === 0, version: (await import("../../lib/version")).formatAppVersion() })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  // Marca pública para la pantalla de inicio: logo, portada y nombre del negocio.
  // `b` es el negocio que entró por última vez en ese equipo; si hay un solo negocio, se usa ese.
  app.get("/api/auth/branding", async (req, res) => {
    try {
      const requested = String(req.query.b ?? "").trim()
      let business = requested
        ? await prisma.business.findUnique({ where: { id: requested }, select: { id: true, name: true } })
        : null
      if (!business) {
        const list = await prisma.business.findMany({ select: { id: true, name: true }, take: 2 })
        business = list.length === 1 ? list[0] : null
      }
      const { brandLogoUrl, loginCoverUrl } = await import("../../lib/cover")
      res.json({
        businessId: business?.id ?? null,
        businessName: business?.name ?? null,
        logo: await brandLogoUrl(business?.id),
        cover: await loginCoverUrl(business?.id),
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/auth/me", async (req, res) => {
    try {
      const session = await readReqSession(req)
      if (!session) {
        res.status(401).json({ error: "Sin sesión" })
        return
      }
      const membership = await prisma.membership.findUnique({
        where: { userId_businessId: { userId: session.userId, businessId: session.businessId } },
        include: { business: true, user: true },
      })
      if (!membership || !isRole(membership.role)) {
        res.status(401).json({ error: "Sesión inválida" })
        return
      }
      res.json({
        user: {
          id: session.userId,
          name: session.configMode ? "Configuración" : membership.user.name,
          email: membership.user.email,
          role: membership.role,
          configMode: session.configMode === true,
        },
        business: {
          id: membership.businessId,
          name: membership.business.name,
          currency: membership.business.currency,
        },
        branchId: session.branchId,
        warehouseId: session.warehouseId,
      })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/auth/login", async (req, res) => {
    const ip = clientIp(req)
    await runWithClientIp(ip, async () => {
      try {
        const username = String(req.body?.username ?? req.body?.email ?? "").trim()
        const password = String(req.body?.password ?? "")

        if (!username && !password) {
          res.status(400).json({ error: "Usuario y contraseña requerida" })
          return
        }

        if (!username && password) {
          assertNoCode(password)
          await assertAttempts("config", 6, 10 * 60 * 1000)
          if (!configPasswordOk(password)) {
            await noteAttempt("config", 10 * 60 * 1000)
            res.status(401).json({ error: "Contraseña incorrecta" })
            return
          }
          await clearAttempts("config")
          const session = await openConfigSession()
          const token = await createSessionToken(session)
          setSessionCookie(res, token)
          res.json({ ok: true, configMode: true })
          return
        }

        if (!password) {
          res.status(400).json({ error: "Usuario y contraseña requerida" })
          return
        }

        await assertAttempts("login", 8, 10 * 60 * 1000)
        const session = await authenticate(username, password)
        await clearAttempts("login")
        const token = await createSessionToken(session)
        setSessionCookie(res, token)
        res.json({ ok: true, configMode: false })
      } catch (error) {
        await noteAttempt("login", 10 * 60 * 1000).catch(() => undefined)
        res.status(401).json({ error: errorMessage(error) })
      }
    })
  })

  app.post("/api/auth/logout", async (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" })
    res.json({ ok: true })
  })
}
