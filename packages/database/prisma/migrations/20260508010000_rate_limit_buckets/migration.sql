-- Persistent rate limit buckets for API, auth, verification, upload, and public-route throttling.

CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope" TEXT NOT NULL,
  "bucketKeyHash" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowSeconds" INTEGER NOT NULL DEFAULT 60,
  "count" INTEGER NOT NULL DEFAULT 0,
  "limit" INTEGER NOT NULL,
  "firstRequestAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRequestAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("uuid")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RateLimitBucket_scope_bucketKeyHash_windowStart_key" ON "RateLimitBucket"("scope", "bucketKeyHash", "windowStart");
CREATE INDEX IF NOT EXISTS "RateLimitBucket_scope_windowStart_idx" ON "RateLimitBucket"("scope", "windowStart");
CREATE INDEX IF NOT EXISTS "RateLimitBucket_bucketKeyHash_windowStart_idx" ON "RateLimitBucket"("bucketKeyHash", "windowStart");
CREATE INDEX IF NOT EXISTS "RateLimitBucket_updatedAt_idx" ON "RateLimitBucket"("updatedAt");
