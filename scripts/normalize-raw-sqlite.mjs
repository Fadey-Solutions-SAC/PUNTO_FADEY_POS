/**
 * Tablas creadas por SQL crudo usan UNIQUE(...) → sqlite_autoindex_*.
 * Prisma db push intenta DROP INDEX de esos autoindexes y SQLite lo rechaza.
 * Reescribe BusinessPaymentMethod al estilo Prisma (UNIQUE INDEX nombrado)
 * sin perder filas, solo si detecta el autoindex conflictivo.
 */
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)

export async function normalizeRawSqliteTables() {
  let PrismaClient
  try {
    ;({ PrismaClient } = require("@prisma/client"))
  } catch {
    console.warn("[normalize] @prisma/client no disponible; se omite")
    return
  }

  const prisma = new PrismaClient()
  try {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='BusinessPaymentMethod'`,
    )
    if (!tables.length) return

    const indexes = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='BusinessPaymentMethod'`,
    )
    const names = indexes.map((row) => String(row.name))
    if (!names.includes("sqlite_autoindex_BusinessPaymentMethod_2")) return
    if (names.includes("BusinessPaymentMethod_businessId_code_key")) return

    console.log("[normalize] BusinessPaymentMethod: convirtiendo UNIQUE autoindex → índice Prisma")
    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF`)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "BusinessPaymentMethod_new" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "businessId" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "locked" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await prisma.$executeRawUnsafe(`
      INSERT INTO "BusinessPaymentMethod_new" ("id","businessId","code","label","locked","createdAt")
      SELECT "id","businessId","code","label","locked","createdAt" FROM "BusinessPaymentMethod"
    `)
    await prisma.$executeRawUnsafe(`DROP TABLE "BusinessPaymentMethod"`)
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "BusinessPaymentMethod_new" RENAME TO "BusinessPaymentMethod"`,
    )
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "BusinessPaymentMethod_businessId_code_key" ON "BusinessPaymentMethod"("businessId", "code")`,
    )
    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=ON`)
    console.log("[normalize] BusinessPaymentMethod: listo")
  } finally {
    await prisma.$disconnect()
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  normalizeRawSqliteTables().catch((error) => {
    console.error("[normalize]", error)
    process.exit(1)
  })
}
