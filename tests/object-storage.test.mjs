import assert from "node:assert/strict";
import test from "node:test";
import { ObjectStorageService } from "../apps/api/dist/apps/api/src/modules/jobs/object-storage.service.js";

test("object storage service parses storage URLs without exposing credentials", () => {
  const service = new ObjectStorageService();
  assert.deepEqual(service.parseStorageUrl("storage://acadid-portal-intake/imports/students.csv"), {
    bucket: "acadid-portal-intake",
    key: "imports/students.csv"
  });
});

test("object storage service downloads storage objects through configured download base", async () => {
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL;
  const originalToken = process.env.ACADID_OBJECT_STORAGE_BEARER_TOKEN;
  const originalTimeout = process.env.ACADID_OBJECT_STORAGE_TIMEOUT_MS;
  process.env.ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL = "https://storage.example.test/private";
  process.env.ACADID_OBJECT_STORAGE_BEARER_TOKEN = "test-token";
  process.env.ACADID_OBJECT_STORAGE_TIMEOUT_MS = "1000";

  let requestedUrl = "";
  let requestedAuth = "";
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestedAuth = options?.headers?.authorization ?? "";
    return new Response("hello", { status: 200, headers: { "content-length": "5" } });
  };

  try {
    const object = await new ObjectStorageService().readObject("storage://bucket-a/folder/student list.csv");
    assert.equal(requestedUrl, "https://storage.example.test/private/bucket-a/folder/student%20list.csv");
    assert.equal(requestedAuth, "Bearer test-token");
    assert.equal(object.content.toString("utf8"), "hello");
    assert.equal(object.source, "download_base");
  } finally {
    globalThis.fetch = originalFetch;
    setOrDeleteEnv("ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL", originalBase);
    setOrDeleteEnv("ACADID_OBJECT_STORAGE_BEARER_TOKEN", originalToken);
    setOrDeleteEnv("ACADID_OBJECT_STORAGE_TIMEOUT_MS", originalTimeout);
  }
});

test("object storage health reports download probe without leaking object keys", async () => {
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL;
  const originalToken = process.env.ACADID_OBJECT_STORAGE_BEARER_TOKEN;
  const originalProbe = process.env.ACADID_OBJECT_STORAGE_HEALTHCHECK_URL;
  process.env.ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL = "https://storage.example.test/private";
  process.env.ACADID_OBJECT_STORAGE_BEARER_TOKEN = "test-token";
  process.env.ACADID_OBJECT_STORAGE_HEALTHCHECK_URL = "storage://health/private/probe.txt";

  globalThis.fetch = async () => new Response("ok", { status: 200, headers: { "content-length": "2" } });

  try {
    const health = await new ObjectStorageService().checkDownloadHealth();
    assert.equal(health.status, "OPERATIONAL");
    assert.equal(health.metadata.provider, "download_base");
    assert.equal(health.metadata.probeConfigured, true);
    assert.equal(health.metadata.probeSucceeded, true);
    assert.equal(health.metadata.probeBytes, 2);
    assert.equal(health.metadata.probeKeyHash.length, 16);
    assert.equal(JSON.stringify(health).includes("private/probe.txt"), false);
  } finally {
    globalThis.fetch = originalFetch;
    setOrDeleteEnv("ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL", originalBase);
    setOrDeleteEnv("ACADID_OBJECT_STORAGE_BEARER_TOKEN", originalToken);
    setOrDeleteEnv("ACADID_OBJECT_STORAGE_HEALTHCHECK_URL", originalProbe);
  }
});

function setOrDeleteEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
