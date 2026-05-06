import { generateKeyPairSync } from "node:crypto";

const keyPair = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" }
});

console.log("Add these values to your deployment environment:");
console.log("");
console.log(`CREDENTIAL_SIGNING_PRIVATE_KEY_PEM=${JSON.stringify(keyPair.privateKey)}`);
console.log(`CREDENTIAL_SIGNING_PUBLIC_KEY_PEM=${JSON.stringify(keyPair.publicKey)}`);
console.log("CREDENTIAL_SIGNING_VERIFICATION_METHOD=did:web:acadid.ng#issuer-ed25519-2026-01");
console.log("ACADID_REQUIRE_CONFIGURED_SIGNING_KEYS=true");
console.log("");
console.log("After adding the values, run:");
console.log("npm run crypto:validate");
