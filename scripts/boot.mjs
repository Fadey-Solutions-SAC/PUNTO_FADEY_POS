import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { normalizeRawSqliteTables } from "./normalize-raw-sqlite.mjs"

// Heap bajo solo al correr (plan starter ~512 MB).
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--max-old-space-size=400"]
  .filter(Boolean)
  .join(" ")

const configured = process.env.DB_PATH?.trim()
if (configured) {
  const file = path.resolve(configured)
  mkdirSync(path.dirname(file), { recursive: true })
  mkdirSync(path.join(path.dirname(file), "uploads"), { recursive: true })
  process.env.DATABASE_URL = `file:${file.replaceAll("\\", "/")}`
}

try {
  await normalizeRawSqliteTables()
} catch (error) {
  console.error("[boot] normalize-raw-sqlite falló:", error)
  process.exit(1)
}

const push = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
})
if (push.status !== 0) process.exit(push.status ?? 1)

const dist = path.join(process.cwd(), "client", "dist", "index.html")
if (!existsSync(dist)) {
  console.error("[boot] falta client/dist. El build de Render debe generar Vite.")
  process.exit(1)
}

// Producción: Express sirve API + SPA Vite.
const start = spawnSync("npx", ["tsx", "server/app.ts"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
})
process.exit(start.status ?? 1)
