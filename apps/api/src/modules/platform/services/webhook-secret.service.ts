import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

@Injectable()
export class WebhookSecretService {
  createSecret() {
    return `whsec_${randomBytes(32).toString("base64url")}`;
  }

  preview(secret: string) {
    return `...${secret.slice(-6)}`;
  }

  encrypt(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
  }

  decrypt(encoded: string) {
    const [version, iv, tag, encrypted] = encoded.split(":");
    if (version !== "v1" || !iv || !tag || !encrypted) {
      throw new Error("Invalid webhook secret encoding.");
    }

    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]);
    return decrypted.toString("utf8");
  }

  private encryptionKey(): Buffer {
    const source = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? "local-development-secret-change-before-pilot";
    return createHash("sha256").update(source).digest();
  }
}
