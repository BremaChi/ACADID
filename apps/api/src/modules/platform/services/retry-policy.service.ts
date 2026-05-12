import { Injectable } from "@nestjs/common";
import { BackgroundJobType } from "@prisma/client";

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
};

const minute = 60 * 1000;

const defaultPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 30 * 1000,
  maxDelayMs: 15 * minute,
  jitterRatio: 0.2
};

const policies: Record<BackgroundJobType, RetryPolicy> = {
  BULK_STUDENT_UPLOAD: { ...defaultPolicy, maxAttempts: 3, baseDelayMs: 20 * 1000, maxDelayMs: 10 * minute },
  RESULT_BATCH_VALIDATION: { ...defaultPolicy, maxAttempts: 3, baseDelayMs: 20 * 1000, maxDelayMs: 10 * minute },
  CREDENTIAL_GENERATION: { ...defaultPolicy, maxAttempts: 5, baseDelayMs: 30 * 1000, maxDelayMs: 20 * minute },
  PDF_GENERATION: { ...defaultPolicy, maxAttempts: 5, baseDelayMs: 30 * 1000, maxDelayMs: 20 * minute },
  SMS_EMAIL_DELIVERY: { ...defaultPolicy, maxAttempts: 5, baseDelayMs: 45 * 1000, maxDelayMs: 30 * minute },
  PUSH_NOTIFICATION: { ...defaultPolicy, maxAttempts: 5, baseDelayMs: 30 * 1000, maxDelayMs: 20 * minute },
  PAYSTACK_PAYMENT_CONFIRMATION: { ...defaultPolicy, maxAttempts: 10, baseDelayMs: minute, maxDelayMs: 60 * minute },
  RECORD_REQUEST_DEADLINE: { ...defaultPolicy, maxAttempts: 4, baseDelayMs: 2 * minute, maxDelayMs: 30 * minute },
  WEBHOOK_DELIVERY: { ...defaultPolicy, maxAttempts: 8, baseDelayMs: 30 * 1000, maxDelayMs: 30 * minute },
  LIVE_RESULTS_CALLBACK: { ...defaultPolicy, maxAttempts: 8, baseDelayMs: 30 * 1000, maxDelayMs: 30 * minute },
  EXAM_BODY_INGEST: { ...defaultPolicy, maxAttempts: 8, baseDelayMs: minute, maxDelayMs: 45 * minute },
  RATE_LIMIT_BUCKET_CLEANUP: { ...defaultPolicy, maxAttempts: 2, baseDelayMs: 5 * minute, maxDelayMs: 15 * minute, jitterRatio: 0.1 },
  IDEMPOTENCY_RECORD_CLEANUP: { ...defaultPolicy, maxAttempts: 2, baseDelayMs: 5 * minute, maxDelayMs: 15 * minute, jitterRatio: 0.1 }
};

@Injectable()
export class RetryPolicyService {
  policyFor(type: BackgroundJobType): RetryPolicy {
    return policies[type] ?? defaultPolicy;
  }

  maxAttemptsFor(type: BackgroundJobType) {
    return this.policyFor(type).maxAttempts;
  }

  shouldRetry(input: { type: BackgroundJobType; attempts: number; maxAttempts?: number; nonRetryable?: boolean }) {
    if (input.nonRetryable) {
      return false;
    }
    return input.attempts < (input.maxAttempts ?? this.maxAttemptsFor(input.type));
  }

  nextRunAfter(type: BackgroundJobType, attempts: number, now = new Date()) {
    return new Date(now.getTime() + this.delayMs(type, attempts));
  }

  delayMs(type: BackgroundJobType, attempts: number, random = Math.random) {
    const policy = this.policyFor(type);
    const exponent = Math.max(0, attempts - 1);
    const exponentialDelay = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
    return Math.max(1000, Math.round(exponentialDelay + this.jitterMs(exponentialDelay, policy.jitterRatio, random)));
  }

  private jitterMs(delayMs: number, jitterRatio: number, random: () => number) {
    const boundedRandom = Math.min(1, Math.max(0, random()));
    return Math.round(delayMs * jitterRatio * boundedRandom);
  }
}
