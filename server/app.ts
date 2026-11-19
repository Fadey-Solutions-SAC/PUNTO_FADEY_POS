/**
 * API Express (migración Vite).
 * Render sigue en Next (`npm run start:server`) hasta el corte final.
 */
import cors from "cors"
import express from "express"
import cookieParser from "cookie-parser"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { applyDatabaseEnv } from "../lib/storage"
import { registerAuthRoutes } from "./routes/auth"
import { APP_VERSION, formatAppVersion } from "../lib/version"

applyDatabaseEnv()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const clientDist = path.join(root, "client", "dist")
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001)

const app = express()
app.disable("x-powered-by")
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)
app.use(express.json({ limit: "2mb" }))
app.use(cookieParser())

app.get("/api/healthz", (_req, res) => {
  res.json({
    ok: true,
    product: "punto-fadey",
    runtime: "express",
    version: APP_VERSION,
  })
})

app.get("/api/version", (_req, res) => {
  res.json({
    version: APP_VERSION,
    label: formatAppVersion(),
    stack: "vite-migration-in-progress",
    nextStillPrimary: true,
  })
})

registerAuthRoutes(app)

if (existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"))
  })
} else {
  app.get("/", (_req, res) => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string }
    res.type("html").send(`<!doctype html>
<html lang="es"><meta charset="utf-8"/><title>Punto Fadey API</title>
<body style="font-family:sans-serif;padding:2rem;background:#0c1222;color:#fff">
<h1>Punto Fadey API</h1>
<p>Versión ${pkg.version}. Producción sigue en Next.</p>
<p><a href="/api/healthz" style="color:#7dd3c7">/api/healthz</a> · <a href="/api/version" style="color:#7dd3c7">/api/version</a></p>
</body></html>`)
  })
}

app.listen(PORT, () => {
  console.log(`[punto-fadey-api] ${formatAppVersion()} en :${PORT} (Vite en paralelo; Next en Render)`)
})
