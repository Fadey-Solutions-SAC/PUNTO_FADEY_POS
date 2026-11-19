/**
 * API Express (migración Vite, por partes).
 * Render SIGUE arrancando Next vía `npm run start:server` hasta el corte final.
 * Dev Vite: `npm run dev:api` → http://localhost:3001
 */
import cors from "cors"
import express from "express"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const clientDist = path.join(root, "client", "dist")

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001)

const app = express()
app.disable("x-powered-by")
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: "2mb" }))

app.get("/api/healthz", (_req, res) => {
  res.json({
    ok: true,
    product: "punto-fadey",
    runtime: "express",
    version: pkg.version,
  })
})

app.get("/api/version", (_req, res) => {
  res.json({
    version: pkg.version,
    label: `v${pkg.version}`,
    stack: "vite-migration-in-progress",
    nextStillPrimary: true,
  })
})

// Cuando exista `client/dist`, Express puede servir el SPA (fase posterior / local).
if (existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next()
    res.sendFile(path.join(clientDist, "index.html"))
  })
} else {
  app.get("/", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="es"><meta charset="utf-8"/><title>Punto Fadey API</title>
<body style="font-family:sans-serif;padding:2rem;background:#0c1222;color:#fff">
<h1>Punto Fadey API</h1>
<p>Versión ${pkg.version}. El POS en producción sigue en Next.</p>
<p><a href="/api/healthz" style="color:#7dd3c7">/api/healthz</a></p>
</body></html>`)
  })
}

app.listen(PORT, () => {
  console.log(`[punto-fadey-api] v${pkg.version} en :${PORT} (migración Vite; Next sigue en Render)`)
})
