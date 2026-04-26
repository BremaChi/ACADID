import { Injectable } from "@nestjs/common";

@Injectable()
export class AccessService {
  passport() {
    return { next: "Return authenticated learner passport." };
  }

  credentials() {
    return { next: "Return authenticated learner credentials." };
  }

  createShareLink(body: unknown) {
    return {
      accepted: true,
      next: "Create scoped, expiring Access Grant and return one-time visible token.",
      received: body
    };
  }

  revokeGrant(body: unknown) {
    return {
      accepted: true,
      next: "Set revokedAt on Access Grant.",
      received: body
    };
  }

  verificationLog() {
    return { next: "Return learner-visible Verification Events." };
  }
}
