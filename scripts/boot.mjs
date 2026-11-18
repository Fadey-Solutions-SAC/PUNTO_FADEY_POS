import { spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import path from "node:path"

const configured = process.env.DB_PATH?.trim()
if (configured) {
  const file = path.resolve(configured)
  mkdirSync(path.dirname(file), { recursive: true })
  mkdirSync(path.join(path.dirname(file), "uploads"), { recursive: true })
  process.env.DATABASE_URL = `file:${file.replaceAll("\\", "/")}`
}

const push = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
})
if (push.status !== 0) process.exit(push.status ?? 1)

const start = spawnSync("npx", ["next", "start"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
})
process.exit(start.status ?? 1)
