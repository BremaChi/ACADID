import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.ACADID_API_URL ?? "http://localhost:4000/api";
const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? "founder@acadid.local";
const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";
const runId = Date.now().toString(36);

function loadRootEnv() {
  try {
    const envFile = readFileSync(resolve(".env"), "utf8");
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
    // The API checks do not require direct .env reads; Prisma checks below will report missing env if needed.
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed with ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function main() {
  loadRootEnv();

  const health = await request("/health");
  if (health.status !== "ok") {
    throw new Error("Health route did not return ok.");
  }

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  const token = login.accessToken;

  const institution = await request("/admin/institutions", {
    method: "POST",
    token,
    body: JSON.stringify({
      officialName: `AcadID Supabase Pilot ${runId}`,
      type: "SECONDARY",
      state: "Lagos",
      tier: "ACTIVE"
    })
  });

  await request(`/admin/institutions/${institution.uuid}/authority-grants`, {
    method: "POST",
    token,
    body: JSON.stringify({
      signedByName: "AcadID Founder",
      signedByTitle: "Founder",
      effectiveFrom: "2026-04-26",
      permissions: {
        all: true
      }
    })
  });

  const academicSession = await request("/ingest/academic-sessions", {
    method: "POST",
    token,
    body: JSON.stringify({
      institutionId: institution.institutionId,
      sessionLabel: `2026/${runId}`,
      periodType: "TERM",
      periodLabel: "First Term",
      status: "ACTIVE",
      isCurrent: false
    })
  });

  const academicStructure = await request("/ingest/academic-structures", {
    method: "POST",
    token,
    body: JSON.stringify({
      institutionId: institution.institutionId,
      type: "LEVEL",
      name: `SS1 Smoke ${runId}`,
      code: `SS1-${runId}`
    })
  });

  const developerAccessRequest = await request("/admin/developer-access-requests", {
    method: "POST",
    token,
    body: JSON.stringify({
      institutionId: institution.uuid,
      developerName: "AcadID Smoke Registrar",
      developerEmail: `smoke-${runId}@example.edu.ng`,
      reason: "Smoke test activation for Live Results API ingestion and governance.",
      requestedScopes: ["ingest:write", "govern:write", "verify:read"]
    })
  });

  const approvedDeveloperAccess = await request(`/admin/developer-access-requests/${developerAccessRequest.uuid}/approve`, {
    method: "POST",
    token,
    body: JSON.stringify({
      feedback: "Approved automatically by smoke test."
    })
  });

  const apiKey = await request(`/admin/institutions/${institution.uuid}/api-keys`, {
    method: "POST",
    token,
    body: JSON.stringify({
      label: `Institution Portal Sandbox ${runId}`,
      scopes: ["ingest:write", "govern:write", "verify:read"],
      environment: "SANDBOX",
      rateLimitPerMinute: 500
    })
  });

  const apiClientLogin = await request("/auth/token", {
    method: "POST",
    body: JSON.stringify({
      client_id: apiKey.clientId,
      client_secret: apiKey.clientSecret
    })
  });
  const institutionToken = apiClientLogin.accessToken;

  const studentNumber = `SUP-${runId}`;
  const students = await request("/ingest/students", {
    method: "POST",
    token: institutionToken,
    body: JSON.stringify({
      institutionId: institution.institutionId,
      entryDate: "2026-01-10",
      rows: [
        {
          fullName: `Supabase Test Learner ${runId}`,
          dateOfBirth: "2010-05-14",
          studentNumber,
          level: "SS2",
          programme: "Science",
          phone: "+2348000000000"
        }
      ]
    })
  });

  const results = await request("/ingest/results", {
    method: "POST",
    token: institutionToken,
    body: JSON.stringify({
      institutionId: institution.institutionId,
      academicSessionId: academicSession.session.uuid,
      structureScopeId: academicStructure.structure.uuid,
      uploadMode: "MASTER_SHEET",
      batchLabel: `Supabase Smoke Batch ${runId}`,
      title: `Supabase Smoke Results ${runId}`,
      rows: [
        {
          studentNumber,
          periodType: "TERM",
          periodLabel: "2026 Term 1",
          subjectCode: "MTH",
          subjectName: "Mathematics",
          caScore: 28,
          examScore: 62,
          totalScore: 90,
          grade: "A"
        }
      ]
    })
  });

  await request("/govern/submit-batch", {
    method: "POST",
    token: institutionToken,
    body: JSON.stringify({ batchId: results.batchId })
  });
  await request("/govern/review-batch", {
    method: "POST",
    token: institutionToken,
    body: JSON.stringify({ batchId: results.batchId })
  });
  await request("/govern/approve-batch", {
    method: "POST",
    token: institutionToken,
    body: JSON.stringify({ batchId: results.batchId })
  });
  const published = await request("/govern/publish", {
    method: "POST",
    token: institutionToken,
    body: JSON.stringify({ batchId: results.batchId })
  });

  const prisma = new PrismaClient();
  const credential = await prisma.credential.findFirst({
    where: {
      academicRecord: {
        is: {
          resultBatchId: results.batchId
        }
      }
    },
    select: {
      credentialRef: true,
      status: true
    },
    orderBy: {
      issuedAt: "desc"
    }
  });
  await prisma.$disconnect();

  if (!credential) {
    throw new Error("Published batch did not create a credential.");
  }

  const verification = await request(`/verify/ref/${credential.credentialRef}`);
  if (verification.outcome !== "CONFIRMED" || verification.cryptographicStatus !== "VALID") {
    throw new Error(`Credential verification failed: ${JSON.stringify(verification)}`);
  }

  console.log(
    JSON.stringify(
      {
        health: health.status,
        founderLogin: login.user.email,
        institution: institution.institutionId,
        academicSession: academicSession.session.uuid,
        academicStructure: academicStructure.structure.uuid,
        developerAccess: approvedDeveloperAccess.status,
        apiClient: apiClientLogin.apiClient.clientId,
        learnerRows: students.rows.length,
        batchStatus: published.status,
        credentialStatus: credential.status,
        verification: verification.cryptographicStatus
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
