import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { normalizeRawSqliteTables } from "./normalize-raw-sqlite.mjs"

const require = createRequire(import.meta.url)

// Hora de Perú para "ventas del día", cierres e informes. Render corre en UTC: sin esto,
// una venta de las 8 p. m. se contaba al día siguiente. Se puede cambiar con la variable TZ.
process.env.TZ = process.env.TZ || "America/Lima"
const t0 = Date.now()
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`

// Heap bajo solo al correr (plan starter ~512 MB).
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--max-old-space-size=400"]
  .filter(Boolean)
  .join(" ")

const configured = process.env.DB_PATH?.trim()
let dbFile = null
if (configured) {
  dbFile = path.resolve(configured)
  mkdirSync(path.dirname(dbFile), { recursive: true })
  mkdirSync(path.join(path.dirname(dbFile), "uploads"), { recursive: true })
  process.env.DATABASE_URL = `file:${dbFile.replaceAll("\\", "/")}`
}

const bin = (name) =>
  path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name)

// db push solo cuando el esquema cambió. La marca vive dentro de la base (PRAGMA user_version,
// que Prisma no toca): si se restaura una copia antigua, el esquema se vuelve a aplicar.
// Nunca usa --accept-data-loss.
const schema = readFileSync(path.join("prisma", "schema.prisma"))
const schemaStamp = Number.parseInt(createHash("sha256").update(schema).digest("hex").slice(0, 7), 16)

async function withPrisma(fn) {
  try {
    const { PrismaClient } = require("@prisma/client")
    const prisma = new PrismaClient()
    try {
      return await fn(prisma)
    } finally {
      await prisma.$disconnect()
    }
  } catch (error) {
    console.warn("[boot] no se pudo leer la marca del esquema:", error?.message ?? error)
    return null
  }
}

const currentStamp =
  dbFile && existsSync(dbFile)
    ? await withPrisma(async (prisma) => {
        const rows = await prisma.$queryRawUnsafe("PRAGMA user_version")
        return Number(rows?.[0]?.user_version ?? 0)
      })
    : null

if (currentStamp !== schemaStamp) {
  try {
    await normalizeRawSqliteTables()
  } catch (error) {
    console.error("[boot] normalize-raw-sqlite falló:", error)
    process.exit(1)
  }

  const pushCommand = existsSync(bin("prisma")) ? `"${bin("prisma")}" db push --skip-generate` : "npx prisma db push --skip-generate"
  const push = spawnSync(pushCommand, { stdio: "inherit", env: process.env, shell: true })
  if (push.status !== 0) process.exit(push.status ?? 1)
  await withPrisma((prisma) => prisma.$executeRawUnsafe(`PRAGMA user_version = ${schemaStamp}`))
  console.log(`[boot] esquema aplicado (${elapsed()})`)
} else {
  console.log(`[boot] esquema sin cambios, se omite db push (${elapsed()})`)
}

const dist = path.join(process.cwd(), "client", "dist", "index.html")
if (!existsSync(dist)) {
  console.error("[boot] falta client/dist. El build de Render debe generar Vite.")
  process.exit(1)
}

// Producción: Express sirve API + SPA Vite. El bundle precompilado arranca mucho más rápido que tsx.
const bundle = path.join(process.cwd(), "dist", "server.mjs")
const [command, args] = existsSync(bundle)
  ? [process.execPath, [bundle]]
  : [process.execPath, ["--import", "tsx", "server/app.ts"]]
console.log(`[boot] iniciando ${existsSync(bundle) ? "dist/server.mjs" : "server/app.ts (tsx)"} (${elapsed()})`)

const child = spawn(command, args, { stdio: "inherit", env: process.env })
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal))
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
