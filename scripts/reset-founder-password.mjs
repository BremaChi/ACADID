import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

loadRootEnv();
preferDirectUrlForRecovery();

const args = parseArgs(process.argv.slice(2));
const email = (args.email ?? process.env.SEED_SUPER_ADMIN_EMAIL ?? "founder@acadid.local").trim().toLowerCase();
const shouldGenerate = Boolean(args.generate);
const clearMfa = Boolean(args["clear-mfa"]);
const password = resolvePassword(args.password, shouldGenerate);

if (!password) {
  fail("Provide --password, set FOUNDER_NEW_PASSWORD, or pass --generate.");
}

if (password.length < 12) {
  fail("Founder password must be at least 12 characters.");
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      uuid: true,
      email: true,
      role: true,
      mfaEnabled: true
    }
  });

  if (!user) {
    throw new Error(`No user found for ${email}.`);
  }

  if (user.role !== "ACADID_SUPER_ADMIN") {
    throw new Error(`Refusing to reset ${email} because the user is not an ACADID_SUPER_ADMIN.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { uuid: user.uuid },
      data: {
        passwordHash: hashPassword(password),
        ...(clearMfa
          ? {
              mfaEnabled: false,
              totpSecretEncrypted: null,
              totpEnabledAt: null
            }
          : {})
      }
    });

    if (clearMfa) {
      await tx.mfaRecoveryCode.deleteMany({
        where: { userId: user.uuid }
      });
    }

    await tx.auditEvent.create({
      data: {
        actorType: "SYSTEM",
        action: "founder.password.reset",
        targetType: "User",
        targetId: user.uuid,
        entityType: "User",
        entityId: user.uuid,
        outcome: "SUCCESS",
        reason: "Local founder recovery command.",
        metadata: {
          email: user.email,
          clearMfa,
          passwordSource: shouldGenerate ? "GENERATED" : "PROVIDED"
        }
      }
    });
  });

  console.log("Founder password reset completed.");
  console.log(`Email: ${user.email}`);
  console.log(`MFA cleared: ${clearMfa ? "yes" : "no"}`);
  if (shouldGenerate) {
    console.log(`Generated password: ${password}`);
    console.log("Store this password securely. It is shown once.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Founder password reset failed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

function loadRootEnv() {
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
    // Prisma will show a clear DATABASE_URL error if the root .env is missing.
  }
}

function preferDirectUrlForRecovery() {
  if (process.env.DIRECT_URL) {
    process.env.DATABASE_URL = process.env.DIRECT_URL;
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function resolvePassword(passwordArg, shouldGenerate) {
  if (typeof passwordArg === "string" && passwordArg.trim()) {
    return passwordArg;
  }
  if (process.env.FOUNDER_NEW_PASSWORD) {
    return process.env.FOUNDER_NEW_PASSWORD;
  }
  if (shouldGenerate) {
    return `Ac${randomBytes(18).toString("base64url")}!9`;
  }
  return "";
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
