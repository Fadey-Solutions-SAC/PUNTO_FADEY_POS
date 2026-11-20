import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

// El disco /var/data de Render no existe durante el build.
delete process.env.DB_PATH
process.env.DATABASE_URL = "file:./prisma/build.db"
process.env.NODE_ENV = "production"
process.env.NEXT_TELEMETRY_DISABLED = "1"
// Vite + Prisma: heap moderado (ya no compilamos Next en Render).
process.env.NODE_OPTIONS = "--max-old-space-size=768"
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 16) {
  process.env.AUTH_SECRET = "render-build-placeholder-secret"
}

mkdirSync("prisma", { recursive: true })

function run(label, command, args) {
  const started = Date.now()
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
  console.log(`[build-render] ${label}: ${((Date.now() - started) / 1000).toFixed(1)} s`)
}

const bin = (name) =>
  path.join("node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name)

const required = [
  "node_modules/prisma/package.json",
  "node_modules/express/package.json",
  "node_modules/esbuild/package.json",
]

for (const file of required) {
  if (!existsSync(file)) {
    console.error(`[build-render] falta ${file}. Revisa el Build Command (npm install).`)
    process.exit(1)
  }
}

run("prisma generate", bin("prisma"), ["generate"])

// Cliente Vite: sus devDependencies (vite, tailwind) sí hacen falta para compilar.
const clientInstall = existsSync(path.join("client", "node_modules", ".bin", "vite"))
  ? ["install", "--prefix", "client", "--include=dev", "--no-audit", "--no-fund", "--prefer-offline"]
  : ["ci", "--prefix", "client", "--include=dev", "--no-audit", "--no-fund"]
run("vite client deps", "npm", clientInstall)
run("vite build", "npm", ["run", "build", "--prefix", "client"])

if (!existsSync(path.join("client", "dist", "index.html"))) {
  console.error("[build-render] falta client/dist/index.html tras el build Vite")
  process.exit(1)
}

// Servidor: un solo archivo JS. Evita compilar TypeScript con tsx en cada arranque.
run("server bundle", bin("esbuild"), [
  "server/app.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node20",
  "--packages=external",
  "--outfile=dist/server.mjs",
  "--log-level=warning",
])

if (!existsSync(path.join("dist", "server.mjs"))) {
  console.error("[build-render] falta dist/server.mjs tras el bundle")
  process.exit(1)
}

console.log("\n[build-render] listo: Express (dist/server.mjs) + Vite (client/dist)")
