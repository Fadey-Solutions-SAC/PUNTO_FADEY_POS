import { mkdirSync } from "node:fs"
import path from "node:path"

/** Un solo archivo SQLite. En Render, DB_PATH apunta al disco persistente. */
export function databaseFilePath() {
  const configured = process.env.DB_PATH?.trim()
  if (configured) return path.resolve(configured)
  const url = process.env.DATABASE_URL ?? "file:./dev.db"
  if (url.startsWith("file:")) {
    let file = url.slice("file:".length)
    if (file.startsWith("//")) file = file.slice(2)
    if (path.isAbsolute(file) || /^[A-Za-z]:[\\/]/.test(file)) return path.resolve(file)
    return path.resolve(process.cwd(), "prisma", file.replace(/^\.\//, ""))
  }
  return path.resolve(process.cwd(), "prisma", "dev.db")
}

export function uploadsDir() {
  if (process.env.DB_PATH?.trim()) return path.join(path.dirname(databaseFilePath()), "uploads")
  return path.join(process.cwd(), "public", "uploads")
}

export function applyDatabaseEnv() {
  const configured = process.env.DB_PATH?.trim()
  if (!configured) return
  const file = path.resolve(configured)
  // En el build de Render el disco persistente aún no está montado.
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    mkdirSync(path.join(path.dirname(file), "uploads"), { recursive: true })
  } catch {
    /* ignore */
  }
  process.env.DATABASE_URL = `file:${file.replaceAll("\\", "/")}`
}
