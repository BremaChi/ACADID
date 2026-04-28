import { randomBytes, timingSafeEqual, scryptSync } from "node:crypto";
import { Injectable } from "@nestjs/common";

@Injectable()
export class PasswordService {
  hash(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `scrypt:${salt}:${hash}`;
  }

  verify(password: string, encodedHash: string): boolean {
    const [scheme, salt, expectedHash] = encodedHash.split(":");
    if (scheme !== "scrypt" || !salt || !expectedHash) {
      return false;
    }

    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, "hex");

    if (actual.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(actual, expected);
  }
}
