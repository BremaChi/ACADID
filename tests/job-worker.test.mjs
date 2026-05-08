import assert from "node:assert/strict";
import test from "node:test";
import { JobWorkerService } from "../apps/api/dist/apps/api/src/modules/jobs/job-worker.service.js";

test("worker leases one queued job and completes it with a domain event", async () => {
  const calls = [];
  const service = new JobWorkerService(
    {
      $transaction: async (callback) =>
        callback({
          $queryRaw: async () => [{ uuid: "job-1" }],
          backgroundJob: {
            update: async ({ where, data, select }) => {
              calls.push({ table: "BackgroundJob", where, data });
              if (select) {
                return {
                  uuid: "job-1",
                  type: "BULK_STUDENT_UPLOAD",
                  queue: "ingestion.bulk",
                  institutionId: "institution-1",
                  createdById: "founder-1",
                  payload: {
                    request: {
                      institutionId: "AINi-00001",
                      fileName: "students.csv",
                      uploadType: "student_register",
                      storageUrl: "pending://students.csv"
                    }
                  },
                  attempts: 1,
                  maxAttempts: 3
                };
              }
              return { uuid: where.uuid };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              calls.push({ table: "DomainEvent", data });
              return { uuid: "event-1", ...data };
            }
          }
        })
    },
    {
      ingestStudents: async () => {
        throw new Error("metadata-only bulk uploads should not call row ingestion");
      }
    },
    {
      parseStudentUpload: async () => {
        throw new Error("metadata-only bulk uploads should not call parser");
      }
    }
  );

  const result = await service.runOnce("worker-test", 1);

  assert.deepEqual(result, { processed: 1, succeeded: 1, failed: 0 });
  assert.equal(calls[0].data.status, "RUNNING");
  assert.equal(calls[1].data.status, "SUCCEEDED");
  assert.equal(calls[1].data.progress, 100);
  assert.equal(calls[2].table, "DomainEvent");
  assert.equal(calls[2].data.type, "bulk_student_upload.succeeded");
});

test("worker retries failed jobs until max attempts", async () => {
  const calls = [];
  const service = new JobWorkerService(
    {
      $transaction: async (callback) =>
        callback({
          $queryRaw: async () => [{ uuid: "job-2" }],
          backgroundJob: {
            update: async ({ where, data, select }) => {
              calls.push({ table: "BackgroundJob", where, data });
              if (select) {
                return {
                  uuid: "job-2",
                  type: "RESULT_BATCH_VALIDATION",
                  queue: "results.validation",
                  institutionId: "institution-1",
                  createdById: "founder-1",
                  payload: { request: { institutionId: "AINi-00001", rows: [] } },
                  attempts: 1,
                  maxAttempts: 3
                };
              }
              return { uuid: where.uuid };
            }
          },
          domainEvent: {
            create: async ({ data }) => {
              calls.push({ table: "DomainEvent", data });
              return { uuid: "event-2", ...data };
            }
          }
        })
    },
    {
      ingestResults: async () => {
        throw new Error("validation failed");
      }
    },
    {
      parseStudentUpload: async () => {
        throw new Error("result validation jobs should not parse uploads");
      }
    }
  );

  const result = await service.runOnce("worker-test", 1);

  assert.deepEqual(result, { processed: 1, succeeded: 0, failed: 1 });
  assert.equal(calls[1].data.status, "RETRYING");
  assert.equal(calls[1].data.error, "validation failed");
  assert.equal(calls[2].data.type, "result_batch_validation.retrying");
});
