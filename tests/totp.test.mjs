import assert from "node:assert/strict";
import test from "node:test";
import { TotpService } from "../apps/api/dist/apps/api/src/modules/auth/totp.service.js";

test("TOTP verifies RFC-compatible 6-digit codes", () => {
  const originalNow = Date.now;
  Date.now = () => 59000;
  try {
    const service = new TotpService();
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    assert.equal(service.verifyCode(secret, "287082"), true);
    assert.equal(service.verifyCode(secret, "000000"), false);
  } finally {
    Date.now = originalNow;
  }
});

test("TOTP secrets are encrypted and decrypted for storage", () => {
  process.env.TOTP_ENCRYPTION_KEY = "test-encryption-key-for-acadid";
  const service = new TotpService();
  const secret = service.createSecret();
  const encrypted = service.encryptSecret(secret);

  assert.notEqual(encrypted, secret);
  assert.equal(service.decryptSecret(encrypted), secret);
});
