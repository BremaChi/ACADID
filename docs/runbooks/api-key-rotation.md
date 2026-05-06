# API Key Rotation Runbook

Owner: Engineer 1 / Data Center API  
Audience: Founder, product engineers, institution operators  
Status: Pilot-ready procedure

## Purpose

API keys protect AcadID gateway access. Product keys and institution keys must be rotated without exposing `client_secret` values or breaking auditability.

## Key Types

Internal Product API Keys:

- Institution Portal
- Student Mobile App
- Employer Verification Portal
- Exam Body Connector

Institution Live Results API Keys:

- Available only after Developer Access approval.
- Scoped to one institution.

## Rotation Rules

- `client_secret` is displayed once only.
- Secrets must stay server-side.
- Never store secrets in frontend JavaScript.
- Never send secrets in screenshots or public chat.
- Every revoke/regenerate action must create an audit event.

## Regenerate A Key

Founder Console path:

```text
Founder Console -> API Keys -> choose key -> Regenerate
```

After regeneration:

1. Copy the new `client_secret` once.
2. Update the owning backend environment variable.
3. Restart or redeploy that product backend.
4. Confirm `/auth/token` succeeds.
5. Confirm the product workflow succeeds.

## Revoke A Key

Founder Console path:

```text
Founder Console -> API Keys -> choose key -> Revoke
```

Use revoke when:

- a secret is leaked,
- an integration is retired,
- an institution is suspended,
- an engineer leaves with access to old secrets.

## Emergency Rotation

If a product key is suspected compromised:

1. Generate a replacement key.
2. Deploy the new secret to the product backend.
3. Confirm token exchange works.
4. Revoke the old key.
5. Review Verification Logs and Audit Events for unusual use.

## Do Not

- Do not create product-local API keys outside the Data Center API.
- Do not allow institutions to create Live Results keys without approved Developer Access.
- Do not return old secrets from listing endpoints.

