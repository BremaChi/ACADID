# Emergency Lockdown Runbook

Owner: Engineer 1 / Data Center API  
Audience: Founder, operations engineer  
Status: Pilot-ready procedure

## Purpose

Emergency lockdown stops gateway API activity when there is a suspected compromise, major data leak, or fraudulent issuing activity.

## When To Use

Use lockdown for:

- suspected API key compromise,
- fraudulent institution activity,
- issuer key compromise,
- unauthorized credential publication,
- active data leakage,
- severe partner API abuse.

## Founder Console Action

Path:

```text
Founder Console -> Security -> Emergency Lockdown
```

The lockdown action revokes active API keys according to the guarded backend workflow and records a founder audit event.

## Immediate Checklist

1. Trigger emergency lockdown.
2. Check System Health for degraded services.
3. Review API key security logs.
4. Review Verification Logs for unusual verification traffic.
5. Review Audit Events by institution, endpoint, and actor.
6. Suspend affected institutions or Developer Access grants.
7. Rotate affected product or institution keys.
8. If credential signing keys may be exposed, follow `credential-signing-keys.md` rotation.

## Communication

Record:

- incident start time,
- affected institution/product,
- suspected actor,
- actions taken,
- whether credentials were issued, amended, revoked, or verified.

## Recovery

Only re-enable integrations after:

- root cause is known,
- compromised keys are revoked,
- replacement keys are deployed,
- affected Authority Grants are reviewed,
- audit trail has been preserved.

## Do Not

- Do not delete audit events.
- Do not manually edit credential status outside governance endpoints.
- Do not restore access before rotating compromised secrets.

