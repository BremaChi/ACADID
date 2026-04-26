import { Injectable } from "@nestjs/common";
import { Ed25519CredentialSigner } from "@acadid/crypto";

@Injectable()
export class CredentialSigningService extends Ed25519CredentialSigner {
  constructor() {
    super({
      privateKeyPem: readPemFromEnv("CREDENTIAL_SIGNING_PRIVATE_KEY_PEM"),
      publicKeyPem: readPemFromEnv("CREDENTIAL_SIGNING_PUBLIC_KEY_PEM"),
      verificationMethod: process.env.CREDENTIAL_SIGNING_VERIFICATION_METHOD
    });
  }
}

function readPemFromEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  if (value.startsWith('"')) {
    return JSON.parse(value) as string;
  }

  return value.replaceAll("\\n", "\n");
}
