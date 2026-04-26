import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { Ed25519CredentialSigner } from "../packages/crypto/dist/index.js";

function createSigner() {
  const keyPair = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" }
  });

  return new Ed25519CredentialSigner({
    privateKeyPem: keyPair.privateKey,
    publicKeyPem: keyPair.publicKey,
    verificationMethod: "did:web:test.acadid#issuer-ed25519"
  });
}

test("Ed25519 signer creates verifiable JOSE/JWS credential proofs", async () => {
  const signer = createSigner();
  const payload = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: "urn:uuid:test-credential",
    type: ["VerifiableCredential", "AcadIDAcademicRecordCredential"],
    issuer: "AINi-00001",
    credentialSubject: {
      learnerId: "learner-1",
      academicRecordId: "record-1",
      grade: "A"
    }
  };

  const signed = await signer.sign(payload);

  assert.equal(signed.proofType, "JOSE_JWS");
  assert.equal(signed.proof.verificationMethod, "did:web:test.acadid#issuer-ed25519");
  assert.equal(await signer.verify(payload, signed.signature), true);
});

test("Ed25519 signature verification fails when the payload is changed", async () => {
  const signer = createSigner();
  const payload = {
    id: "urn:uuid:test-credential",
    credentialSubject: { grade: "A" }
  };
  const signed = await signer.sign(payload);

  assert.equal(await signer.verify({ ...payload, credentialSubject: { grade: "F" } }, signed.signature), false);
});
