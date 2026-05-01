import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

export type CredentialProofType = "DATA_INTEGRITY" | "JOSE_JWS" | "SD_JWT";

export interface CredentialSigner {
  sign(payload: unknown): Promise<SignedCredentialPayload>;
  verify(payload: unknown, signature: string): Promise<boolean>;
  publicJwk(): JsonWebKey;
}

export interface SignedCredentialPayload {
  payload: unknown;
  signature: string;
  proofType: CredentialProofType;
  proof: CredentialProof;
}

export interface CredentialProof {
  type: "JsonWebSignature2020";
  proofPurpose: "assertionMethod";
  created: string;
  verificationMethod: string;
  jws: string;
}

export interface Ed25519CredentialSignerOptions {
  privateKeyPem?: string;
  publicKeyPem?: string;
  verificationMethod?: string;
  requireConfiguredKeys?: boolean;
}

export interface CredentialSignerReadiness {
  proofProfile: "JOSE_JWS";
  algorithm: "EdDSA";
  curve: "Ed25519";
  verificationMethod: string;
  keySource: "CONFIGURED" | "EPHEMERAL_DEV";
  configured: boolean;
  productionReady: boolean;
  publicJwk: JsonWebKey;
  warning?: string;
}

interface JwsHeader {
  alg: "EdDSA";
  b64: true;
  crit: ["b64"];
  kid: string;
  typ: "vc+ld+jws";
}

const defaultVerificationMethod = "did:web:localhost:acadid#dev-ed25519";

export class Ed25519CredentialSigner implements CredentialSigner {
  private readonly privateKey;
  private readonly publicKey;
  private readonly verificationMethod: string;
  private readonly keySource: "CONFIGURED" | "EPHEMERAL_DEV";

  constructor(private readonly options: Ed25519CredentialSignerOptions = {}) {
    const keyMaterial = this.resolveKeyMaterial();
    this.privateKey = createPrivateKey(keyMaterial.privateKeyPem);
    this.publicKey = createPublicKey(keyMaterial.publicKeyPem);
    this.verificationMethod = options.verificationMethod ?? defaultVerificationMethod;
    this.keySource = keyMaterial.keySource;
    this.assertKeyPairMatches();
  }

  async sign(payload: unknown): Promise<SignedCredentialPayload> {
    const created = new Date().toISOString();
    const header: JwsHeader = {
      alg: "EdDSA",
      b64: true,
      crit: ["b64"],
      kid: this.verificationMethod,
      typ: "vc+ld+jws"
    };
    const encodedHeader = base64Url(JSON.stringify(header));
    const encodedPayload = base64Url(canonicalJson(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const encodedSignature = sign(null, Buffer.from(signingInput), this.privateKey).toString("base64url");
    const jws = `${signingInput}.${encodedSignature}`;

    return {
      payload,
      signature: jws,
      proofType: "JOSE_JWS",
      proof: {
        type: "JsonWebSignature2020",
        proofPurpose: "assertionMethod",
        created,
        verificationMethod: this.verificationMethod,
        jws
      }
    };
  }

  async verify(payload: unknown, signature: string): Promise<boolean> {
    const [encodedHeader, encodedPayload, encodedSignature] = signature.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return false;
    }

    const expectedPayload = base64Url(canonicalJson(payload));
    if (encodedPayload !== expectedPayload) {
      return false;
    }

    return verify(
      null,
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      this.publicKey,
      Buffer.from(encodedSignature, "base64url")
    );
  }

  publicJwk(): JsonWebKey {
    return this.publicKey.export({ format: "jwk" }) as JsonWebKey;
  }

  readiness(): CredentialSignerReadiness {
    const configured = this.keySource === "CONFIGURED";
    return {
      proofProfile: "JOSE_JWS",
      algorithm: "EdDSA",
      curve: "Ed25519",
      verificationMethod: this.verificationMethod,
      keySource: this.keySource,
      configured,
      productionReady: configured,
      publicJwk: this.publicJwk(),
      warning: configured ? undefined : "Using an ephemeral development signing key. Configure CREDENTIAL_SIGNING_PRIVATE_KEY_PEM and CREDENTIAL_SIGNING_PUBLIC_KEY_PEM before production."
    };
  }

  private resolveKeyMaterial() {
    const hasPrivateKey = Boolean(this.options.privateKeyPem);
    const hasPublicKey = Boolean(this.options.publicKeyPem);
    if (hasPrivateKey !== hasPublicKey) {
      throw new Error("Credential signing requires both private and public PEM keys.");
    }

    if (this.options.privateKeyPem && this.options.publicKeyPem) {
      return {
        privateKeyPem: this.options.privateKeyPem,
        publicKeyPem: this.options.publicKeyPem,
        keySource: "CONFIGURED" as const
      };
    }

    if (this.options.requireConfiguredKeys) {
      throw new Error("Configured credential signing keys are required in this environment.");
    }

    const generated = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" }
    });

    return {
      privateKeyPem: generated.privateKey,
      publicKeyPem: generated.publicKey,
      keySource: "EPHEMERAL_DEV" as const
    };
  }

  private assertKeyPairMatches() {
    const probe = Buffer.from("acadid-signing-key-self-test");
    const signature = sign(null, probe, this.privateKey);
    if (!verify(null, probe, this.publicKey, signature)) {
      throw new Error("Credential signing private and public keys do not match.");
    }
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortJson((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}
