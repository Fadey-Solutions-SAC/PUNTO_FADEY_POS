import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

delete process.env.DB_PATH;
process.env.DATABASE_URL = "file:./verify.db";
process.env.AUTH_SECRET = "verify-secret-verify-secret-verify";

async function main() {
  for (const file of ["prisma/verify.db", "prisma/verify.db-journal"]) {
    if (existsSync(file)) unlinkSync(file);
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: process.env,
  });

  const { run } = await import("./verify-core");
  await run();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
