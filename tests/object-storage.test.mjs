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
  process.env.ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL = "https://storage.example.test/private";
  process.env.ACADID_OBJECT_STORAGE_BEARER_TOKEN = "test-token";

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
  }
});

function setOrDeleteEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
