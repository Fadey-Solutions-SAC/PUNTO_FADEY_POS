import { spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"

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

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env, shell: true })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run("npx", ["prisma", "generate"])
run("npx", ["next", "build"])
