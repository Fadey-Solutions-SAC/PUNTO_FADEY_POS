import { spawnSync } from "node:child_process"
import { mkdirSync, existsSync } from "node:fs"
import path from "node:path"

// El disco /var/data de Render no existe durante el build.
delete process.env.DB_PATH
process.env.DATABASE_URL = "file:./prisma/build.db"
process.env.NODE_ENV = "production"
process.env.NEXT_TELEMETRY_DISABLED = "1"
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--max-old-space-size=400"].filter(Boolean).join(" ")
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 16) {
  process.env.AUTH_SECRET = "render-build-placeholder-secret"
}

mkdirSync("prisma", { recursive: true })

function run(label, command, args) {
  console.log(`\n[build-render] ${label}`)
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  })
  if (result.error) {
    console.error(`[build-render] no se pudo iniciar ${command}:`, result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`[build-render] falló ${label} (exit ${result.status})`)
    process.exit(result.status ?? 1)
  }
}

const prisma = path.join("node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma")
const next = path.join("node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next")
if (!existsSync(prisma)) {
  console.error("[build-render] falta node_modules/.bin/prisma; corre npm install primero")
  process.exit(1)
}

run("prisma generate", prisma, ["generate"])
run("next build", next, ["build"])
