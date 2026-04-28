import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

@Injectable()
export class TotpService {
  createSecret(): string {
    const bytes = randomBytes(20);
    let bits = "";
    for (const byte of bytes) {
      bits += byte.toString(2).padStart(8, "0");
    }

    let secret = "";
    for (let index = 0; index < bits.length; index += 5) {
      const chunk = bits.slice(index, index + 5).padEnd(5, "0");
      secret += alphabet[Number.parseInt(chunk, 2)];
    }

    return secret;
  }

  createOtpAuthUrl(input: { secret: string; accountName: string; issuer?: string }): string {
    const issuer = input.issuer ?? "AcadID";
    const label = encodeURIComponent(`${issuer}:${input.accountName}`);
    const query = new URLSearchParams({
      secret: input.secret,
      issuer,
      algorithm: "SHA1",
      digits: "6",
      period: "30"
    });
    return `otpauth://totp/${label}?${query.toString()}`;
  }

  encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
  }

  decryptSecret(encoded: string): string {
    const [version, iv, tag, encrypted] = encoded.split(":");
    if (version !== "v1" || !iv || !tag || !encrypted) {
      throw new Error("Invalid TOTP secret encoding.");
    }

    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  }

  verifyCode(secret: string, code: string): boolean {
    const normalized = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalized)) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000 / 30);
    return [-1, 0, 1].some((offset) => this.constantTimeEqual(this.generateCode(secret, now + offset), normalized));
  }

  private generateCode(secret: string, counter: number): string {
    const key = this.decodeBase32(secret);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const hmac = createHmac("sha1", key).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return (binary % 1_000_000).toString().padStart(6, "0");
  }

  private decodeBase32(secret: string): Buffer {
    const clean = secret.toUpperCase().replace(/=+$/g, "");
    let bits = "";
    for (const char of clean) {
      const value = alphabet.indexOf(char);
      if (value === -1) {
        throw new Error("Invalid base32 secret.");
      }
      bits += value.toString(2).padStart(5, "0");
    }

    const bytes = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
  }

  private constantTimeEqual(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }

  private encryptionKey(): Buffer {
    const source = process.env.TOTP_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? "local-development-secret-change-before-pilot";
    return createHash("sha256").update(source).digest();
  }
}
