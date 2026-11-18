import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
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

const bin = (name) =>
  path.join("node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name)

const required = [
  "node_modules/tailwindcss/package.json",
  "node_modules/@tailwindcss/postcss/package.json",
  "node_modules/next/package.json",
  "node_modules/prisma/package.json",
]

for (const file of required) {
  if (!existsSync(file)) {
    console.error(`[build-render] falta ${file}. Revisa el Build Command: npm install --include=dev`)
    process.exit(1)
  }
}

run("prisma generate", bin("prisma"), ["generate"])
// Webpack + PostCSS evita el loader @tailwindcss/turbopack en el build de Render.
run("next build", bin("next"), ["build", "--webpack"])
