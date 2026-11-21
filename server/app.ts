/**
 * API Express + SPA Vite (arranque de producción en Render).
 */
import cors from "cors"
import express from "express"
import cookieParser from "cookie-parser"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { applyDatabaseEnv, uploadsDir } from "../lib/storage"
import { registerAuthRoutes } from "./routes/auth"
import { registerBillingRoutes } from "./routes/billing"
import { registerCashRoutes } from "./routes/cash"
import { registerCatalogRoutes } from "./routes/catalog"
import { registerCatalogExtraRoutes } from "./routes/catalog-extra"
import { registerCustomersRoutes } from "./routes/customers"
import { registerInventoryRoutes } from "./routes/inventory"
import { registerLossesRoutes } from "./routes/losses"
import { registerCountRoutes } from "./routes/counts"
import { registerAssistantRoutes } from "./routes/assistant"
import { registerEntriesRoutes } from "./routes/entries"
import { registerLookupRoutes } from "./routes/lookup"
import { registerPurchasesRoutes } from "./routes/purchases"
import { registerReportsRoutes } from "./routes/reports"
import { registerSalesRoutes } from "./routes/sales"
import { registerSettingsRoutes } from "./routes/settings"
import { registerUsersRoutes } from "./routes/users"
import { APP_VERSION, formatAppVersion } from "../lib/version"
import { autoBackup } from "../lib/backup"
import { prisma } from "../lib/db"
import { errorMessage } from "../lib/errors"

// Días y rangos de fechas en hora de Perú (Render corre en UTC). Ver también scripts/boot.mjs.
process.env.TZ = process.env.TZ || "America/Lima"

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
    stack: "express-vite",
    nextStillPrimary: false,
  })
})

registerAuthRoutes(app)
registerCashRoutes(app)
registerSalesRoutes(app)
registerCatalogRoutes(app)
registerCatalogExtraRoutes(app)
registerCustomersRoutes(app)
registerInventoryRoutes(app)
registerLossesRoutes(app)
registerCountRoutes(app)
registerAssistantRoutes(app)
registerEntriesRoutes(app)
registerLookupRoutes(app)
registerPurchasesRoutes(app)
registerBillingRoutes(app)
registerReportsRoutes(app)
registerSettingsRoutes(app)
registerUsersRoutes(app)

app.use("/uploads", express.static(uploadsDir()))

if (existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/^(?!\/api)(?!\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"))
  })
} else {
  app.get("/", (_req, res) => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string }
    res.type("html").send(`<!doctype html>
<html lang="es"><meta charset="utf-8"/><title>Punto Fadey API</title>
<body style="font-family:sans-serif;padding:2rem;background:#0c1222;color:#fff">
<h1>Punto Fadey API</h1>
<p>Versión ${pkg.version}. Falta client/dist (build Vite).</p>
<p><a href="/api/healthz" style="color:#7dd3c7">/api/healthz</a> · <a href="/api/version" style="color:#7dd3c7">/api/version</a></p>
</body></html>`)
  })
}

app.listen(PORT, () => {
  console.log(`[punto-fadey-api] ${formatAppVersion()} en :${PORT} (Express + Vite)`)
})

// El sistema ya no maneja lotes ni vencimientos: ningún producto los controla.
prisma.product
  .updateMany({ where: { trackLots: true }, data: { trackLots: false } })
  .then((result) => {
    if (result.count) console.log(`[lotes] ${result.count} producto(s) dejaron de controlar lotes`)
  })
  .catch((error) => console.error("[lotes] no se pudo actualizar:", errorMessage(error)))

// Vencimientos: los grupos (lotes) nunca suman más que el stock real; el exceso sale de lo que vence antes.
prisma.lot
  .findMany({ where: { quantity: { gt: 0 } }, orderBy: [{ expiresAt: "asc" }, { code: "asc" }] })
  .then(async (lots) => {
    const groups = new Map<string, typeof lots>()
    for (const lot of lots) {
      const key = `${lot.warehouseId}|${lot.productId}`
      groups.set(key, [...(groups.get(key) ?? []), lot])
    }
    let trimmed = 0
    for (const [key, list] of groups) {
      const [warehouseId, productId] = key.split("|")
      const balance = await prisma.stockBalance.findUnique({ where: { warehouseId_productId: { warehouseId, productId } } })
      let excess = list.reduce((sum, lot) => sum + lot.quantity, 0) - Math.max(0, balance?.quantity ?? 0)
      for (const lot of list) {
        if (excess <= 0) break
        const take = Math.min(excess, lot.quantity)
        await prisma.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } })
        excess -= take
        trimmed += 1
      }
    }
    if (trimmed) console.log(`[vencimientos] ${trimmed} grupo(s) ajustados al stock real`)
  })
  .catch((error) => console.error("[vencimientos] no se pudo ajustar:", errorMessage(error)))

// Marcas en mayúsculas: las antiguas se pasan a mayúsculas si no chocan con otra marca igual.
prisma.brand
  .findMany({ select: { id: true, businessId: true, name: true } })
  .then(async (brands) => {
    let changed = 0
    for (const brand of brands) {
      const upper = brand.name.trim().toLocaleUpperCase("es-PE")
      if (upper === brand.name) continue
      const clash = brands.some((other) => other.id !== brand.id && other.businessId === brand.businessId && other.name === upper)
      if (clash) continue
      await prisma.brand.update({ where: { id: brand.id }, data: { name: upper } })
      changed += 1
    }
    if (changed) console.log(`[marcas] ${changed} marca(s) pasaron a mayúsculas`)
  })
  .catch((error) => console.error("[marcas] no se pudo actualizar:", errorMessage(error)))

// Copia automática diaria (se guardan las últimas 7 en el disco, junto a la base).
const runAutoBackup = () => {
  autoBackup()
    .then((name) => {
      if (name) console.log(`[backup] copia automática ${name}`)
    })
    .catch((error) => console.error("[backup] no se pudo crear la copia automática:", errorMessage(error)))
}
setTimeout(runAutoBackup, 60_000).unref()
setInterval(runAutoBackup, 6 * 60 * 60 * 1000).unref()
