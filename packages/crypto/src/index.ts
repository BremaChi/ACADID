export interface CredentialSigner {
  sign(payload: unknown): Promise<SignedCredentialPayload>;
}

export interface SignedCredentialPayload {
  payload: unknown;
  signature: string;
  proofType: "DATA_INTEGRITY" | "JOSE_JWS" | "SD_JWT" | "PLACEHOLDER";
}

export class PlaceholderCredentialSigner implements CredentialSigner {
  async sign(payload: unknown): Promise<SignedCredentialPayload> {
    return {
      payload,
      signature: "placeholder-signature-replace-before-pilot",
      proofType: "PLACEHOLDER"
    };
  }
}
