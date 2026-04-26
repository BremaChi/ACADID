import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? "founder@acadid.local";
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName: "AcadID Founder Admin",
      role: "ACADID_SUPER_ADMIN"
    },
    create: {
      email,
      passwordHash: hashPassword(password),
      fullName: "AcadID Founder Admin",
      role: "ACADID_SUPER_ADMIN"
    }
  });

  await prisma.auditEvent.create({
    data: {
      actorId: user.uuid,
      actorRole: "ACADID_SUPER_ADMIN",
      action: "seed.super_admin",
      targetType: "User",
      targetId: user.uuid,
      outcome: "SUCCESS",
      metadata: {
        email
      }
    }
  });

  console.log(`Seeded AcadID Super Admin: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
