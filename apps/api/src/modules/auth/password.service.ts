import { timingSafeEqual, scryptSync } from "node:crypto";
import { Injectable } from "@nestjs/common";

@Injectable()
export class PasswordService {
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
