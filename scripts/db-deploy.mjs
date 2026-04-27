import { spawnSync } from "node:child_process";

const prismaResult = spawnSync(process.execPath, ["scripts/prisma-with-root-env.mjs", "migrate", "deploy"], {
  stdio: "inherit"
});

if (prismaResult.status === 0) {
  process.exit(0);
}

console.warn(
  "Prisma migrate deploy did not complete. Falling back to the Prisma Client migration runner for Supabase."
);

const fallbackResult = spawnSync(process.execPath, ["scripts/apply-initial-migration.mjs"], {
  stdio: "inherit"
});

process.exit(fallbackResult.status ?? 1);
