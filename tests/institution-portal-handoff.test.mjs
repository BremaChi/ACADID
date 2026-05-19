import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(source, values, label) {
  for (const value of values) {
    assert.match(source, new RegExp(escapeRegExp(value)), `${label} missing ${value}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("approved institution dashboard handoff documents every Institution Portal Team API surface", () => {
  const handoff = read("docs/handoff/INSTITUTION_PORTAL_HANDOFF.md");

  assertIncludes(
    handoff,
    [
      "/api/portal/staff",
      "/api/portal/staff/scope-options",
      "/api/portal/staff/invite",
      "/api/portal/staff/:id",
      "/api/ingest/academic-sessions",
      "/api/ingest/academic-structures",
      "/api/ingest/grading-rules",
      "/api/ingest/students",
      "/api/ingest/results",
      "/api/ingest/results/async",
      "/api/ingest/bulk-upload",
      "/api/ingest/batches/:id",
      "/api/jobs/:id",
      "/api/govern/transfers",
      "/api/govern/transfers/:id/review",
      "/api/govern/rollovers/preview",
      "/api/govern/rollovers/confirm",
      "/api/govern/rollovers/:id/disputes",
      "/api/govern/rollovers/:id/disputes/resolve",
      "/api/govern/sealed-sessions/:id/reopen-request",
      "/api/govern/sealed-sessions/:id/reopen-review",
      "/api/govern/record-requests",
      "/api/govern/record-requests/:id/review",
      "/api/govern/record-requests/:id/payment/confirm",
      "/api/govern/record-requests/:id/fulfill"
    ],
    "approved institution dashboard handoff"
  );

  assert.match(handoff, /must not connect directly to Supabase/i);
  assert.match(handoff, /Human session/i);
  assert.match(handoff, /x-idempotency-key/i);
  assert.match(handoff, /assigned academic scopes/i);
});

test("source controllers still expose the Institution Portal handoff roots", () => {
  const portalController = read("apps/api/src/modules/portal/portal.controller.ts");
  const ingestionController = read("apps/api/src/modules/gateway/ingestion/ingestion.controller.ts");
  const governanceController = read("apps/api/src/modules/gateway/governance/governance.controller.ts");

  assertIncludes(portalController, ['@Get("staff")', '@Get("staff/scope-options")', '@Post("staff/invite")', '@Patch("staff/:id")'], "portal controller");

  assertIncludes(
    ingestionController,
    [
      '@Post("academic-sessions")',
      '@Get("academic-sessions")',
      '@Patch("academic-sessions/:id")',
      '@Post("academic-structures")',
      '@Get("academic-structures")',
      '@Patch("academic-structures/:id")',
      '@Post("grading-rules")',
      '@Get("grading-rules")',
      '@Patch("grading-rules/:id")',
      '@Post("students")',
      '@Post("results")',
      '@Post("results/async")',
      '@Post("bulk-upload")',
      '@Get("batches")',
      '@Get("batches/:id")'
    ],
    "ingestion controller"
  );

  assertIncludes(
    governanceController,
    [
      '@Post("submit-batch")',
      '@Post("review-batch")',
      '@Post("approve-batch")',
      '@Post("publish")',
      '@Post("reject-batch")',
      '@Post("rollovers/preview")',
      '@Post("rollovers/confirm")',
      '@Post("transfers")',
      '@Get("transfers")',
      '@Post("transfers/:id/review")',
      '@Post("rollovers/:id/disputes")',
      '@Post("rollovers/:id/disputes/resolve")',
      '@Post("sealed-sessions/:id/reopen-request")',
      '@Post("sealed-sessions/:id/reopen-review")',
      '@Get("record-requests")',
      '@Post("record-requests/:id/review")',
      '@Post("record-requests/:id/payment/confirm")',
      '@Post("record-requests/:id/fulfill")'
    ],
    "governance controller"
  );
});

test("existing focused tests cover each approved institution dashboard dependency", () => {
  const expectedCoverage = [
    "tests/portal-staff-management.test.mjs",
    "tests/v5-academic-setup.test.mjs",
    "tests/v5-rollover.test.mjs",
    "tests/v5-transfer-workflows.test.mjs",
    "tests/record-requests.test.mjs",
    "tests/event-jobs.test.mjs"
  ];

  const coverageText = expectedCoverage.map((path) => read(path)).join("\n");

  assert.match(coverageText, /blocks machine keys|Human institution session is required/i);
  assert.match(coverageText, /creates and lists academic sessions/i);
  assert.match(coverageText, /confirms promotion rollover/i);
  assert.match(coverageText, /creates and approves a transfer request/i);
  assert.match(coverageText, /rollover dispute opens and resolves/i);
  assert.match(coverageText, /RecordRequest|record request|record-requests/i);
  assert.match(coverageText, /idempotent|idempotency|background job/i);
});
