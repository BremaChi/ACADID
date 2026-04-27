import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const envPath = resolve(".env");

try {
  const envFile = readFileSync(envPath, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
} catch {
  // Prisma will show a clear missing-env error if .env is absent.
}

const prismaArgs = process.argv.slice(2);
const prismaCli = resolve("packages/database/node_modules/prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, ...prismaArgs, "--schema", "packages/database/prisma/schema.prisma"], {
  env: process.env,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
