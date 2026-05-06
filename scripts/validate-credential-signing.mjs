import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  loadRootEnv();

  const { Ed25519CredentialSigner } = await import("../packages/crypto/dist/index.js").catch(() => {
    throw new Error("Credential signing validator needs the crypto package build. Run npm run build first.");
  });

  const signer = new Ed25519CredentialSigner({
    privateKeyPem: readPemFromEnv("CREDENTIAL_SIGNING_PRIVATE_KEY_PEM"),
    publicKeyPem: readPemFromEnv("CREDENTIAL_SIGNING_PUBLIC_KEY_PEM"),
    verificationMethod: process.env.CREDENTIAL_SIGNING_VERIFICATION_METHOD,
    requireConfiguredKeys: true
  });

  const readiness = signer.readiness();
  const samplePayload = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: "urn:uuid:acadid-signing-readiness-check",
    type: ["VerifiableCredential", "AcadIDSigningReadinessCredential"],
    issuer: readiness.verificationMethod.split("#")[0],
    credentialSubject: {
      purpose: "deployment-signing-key-self-test"
    }
  };
  const signed = await signer.sign(samplePayload);
  const verified = await signer.verify(samplePayload, signed.signature);

  if (!readiness.productionReady || !verified) {
    throw new Error("Configured credential signing keypair could not sign and verify a readiness credential.");
  }

  console.log("Credential signing validation passed.");
  console.log(`Proof profile: ${readiness.proofProfile}`);
  console.log(`Algorithm: ${readiness.algorithm}`);
  console.log(`Curve: ${readiness.curve}`);
  console.log(`Verification method: ${readiness.verificationMethod}`);
  console.log(`Key source: ${readiness.keySource}`);
  console.log(`Public JWK kid: ${readiness.verificationMethod}`);
  console.log(`Public JWK x: ${readiness.publicJwk.x}`);
} catch (error) {
  console.error("Credential signing validation failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
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
    // The validator will show a clear missing-key error if .env is absent.
  }
}

function readPemFromEnv(name) {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  if (value.startsWith('"')) {
    return JSON.parse(value);
  }

  return value.replaceAll("\\n", "\n");
}
