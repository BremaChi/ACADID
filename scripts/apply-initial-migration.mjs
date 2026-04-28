import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const envPath = resolve(".env");
const migrationsPath = resolve("packages/database/prisma/migrations");
const expectedTables = [
  "Learner",
  "Institution",
  "User",
  "AuthorityGrant",
  "Enrolment",
  "ResultBatch",
  "AcademicRecord",
  "Credential",
  "AccessGrant",
  "VerificationEvent",
  "AuditEvent"
];

function loadRootEnv() {
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
    // The checks below will report missing connection settings clearly.
  }
}

function splitSqlStatements(sql) {
  const statements = [];
  let statement = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const previous = sql[index - 1];

    if (current === "'" && !inDoubleQuote && previous !== "\\") {
      inSingleQuote = !inSingleQuote;
    }

    if (current === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    if (current === ";" && !inSingleQuote && !inDoubleQuote) {
      const trimmed = statement.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      statement = "";
      continue;
    }

    statement += current;
  }

  const trailing = statement.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

async function ensureMigrationTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY ("id")
    )
  `);
}

async function markMigrationApplied(prisma, migrationName, checksum, appliedStepsCount) {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "_prisma_migrations" (
        "id",
        "checksum",
        "finished_at",
        "migration_name",
        "logs",
        "rolled_back_at",
        "started_at",
        "applied_steps_count"
      )
      VALUES ($1, $2, now(), $3, NULL, NULL, now(), $4)
      ON CONFLICT ("id") DO NOTHING
    `,
    randomUUID(),
    checksum,
    migrationName,
    appliedStepsCount
  );
}

async function main() {
  loadRootEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from root .env");
  }

  const prisma = new PrismaClient();

  try {
    await ensureMigrationTable(prisma);

    const migrationNames = readdirSync(migrationsPath)
      .filter((name) => statSync(resolve(migrationsPath, name)).isDirectory())
      .sort();

    for (const migrationName of migrationNames) {
      const migrationPath = resolve(migrationsPath, migrationName, "migration.sql");
      const migrationSql = readFileSync(migrationPath, "utf8");
      const checksum = createHash("sha256").update(migrationSql).digest("hex");
      const statements = splitSqlStatements(migrationSql);

      const existingMigration = await prisma.$queryRawUnsafe(
        `SELECT "migration_name" FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "rolled_back_at" IS NULL LIMIT 1`,
        migrationName
      );
      if (existingMigration.length > 0) {
        console.log(`Migration ${migrationName} is already marked as applied.`);
        continue;
      }

      if (migrationName.endsWith("_init")) {
        const existingTables = await prisma.$queryRawUnsafe(
          `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = ANY($1::text[])
          `,
          expectedTables
        );

        if (existingTables.length > 0) {
          if (existingTables.length === expectedTables.length) {
            await markMigrationApplied(prisma, migrationName, checksum, statements.length);
            console.log(`Existing AcadID schema detected; marked ${migrationName} as applied.`);
            continue;
          }

          const names = existingTables.map((table) => table.table_name).join(", ");
          throw new Error(`Partial AcadID schema detected (${names}). Review Supabase before applying migrations.`);
        }
      }

      await prisma.$transaction(
        async (tx) => {
          for (const statement of statements) {
            await tx.$executeRawUnsafe(statement);
          }

          await tx.$executeRawUnsafe(
            `
              INSERT INTO "_prisma_migrations" (
                "id",
                "checksum",
                "finished_at",
                "migration_name",
                "logs",
                "rolled_back_at",
                "started_at",
                "applied_steps_count"
              )
              VALUES ($1, $2, now(), $3, NULL, NULL, now(), $4)
            `,
            randomUUID(),
            checksum,
            migrationName,
            statements.length
          );
        },
        {
          maxWait: 20000,
          timeout: 120000
        }
      );

      console.log(`Applied ${migrationName} to Supabase PostgreSQL.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
