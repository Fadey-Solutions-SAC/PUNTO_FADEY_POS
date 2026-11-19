/**
 * Compatibilidad: la API vive en server/app.ts.
 * Preferir: npm run dev:api / npm run start:api
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const result = spawnSync(process.execPath, ["--import", "tsx", "server/app.ts"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
})
process.exit(result.status ?? 1)
