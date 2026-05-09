# Distributed Cache Runbook

AcadID uses `CacheService` for safe read-heavy surfaces. The service always keeps a fast in-process L1 cache and can optionally use an Upstash Redis REST L2 cache for multi-instance deployments.

## Current Cached Surfaces

- Public credential status.
- Platform settings.
- Founder institution metadata.

Do not cache API secrets, one-time client secrets, private student records, share-token verification payloads, NIN, BVN, or unconsented credential data.

## Local Development

Default local mode:

```env
ACADID_CACHE_ADAPTER=memory
```

This is fast and enough for one local API process.

## Production/Pilot Multi-Instance Mode

Configure:

```env
ACADID_CACHE_ADAPTER=upstash
ACADID_CACHE_KEY_PREFIX=acadid:cache
ACADID_CACHE_TIMEOUT_MS=1000
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Behavior:

- Reads check L1 memory first.
- On L1 miss, the API checks Redis L2.
- On loader success, the value is stored in L1 and L2 with the configured TTL.
- Tag invalidation removes local keys immediately and sends invalidation to L2.
- If L2 is unavailable, requests continue using L1/database instead of failing the gateway.

## Health Visibility

Founder System Health reports:

- Cache adapter: `memory` or `upstash-redis`.
- Whether a distributed adapter is configured.
- L1 entry/tag counts.
- L2 adapter metadata when configured.

## Production Notes

- Keep TTLs short for data that can affect verification or governance state.
- Add explicit invalidation whenever implementing amendment/revocation writes.
- Do not use cache as a queue, audit log, or source of truth.
