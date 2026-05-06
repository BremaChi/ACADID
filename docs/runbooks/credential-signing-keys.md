# Credential Signing Key Runbook

AcadID credential publication uses Ed25519 with JOSE/JWS proof payloads. Local development may use ephemeral keys, but pilot and production environments must use stable deployment keys.

## Generate Keys

Run this on a trusted operator machine:

```bash
npm run crypto:keygen
```

The command prints:

- `CREDENTIAL_SIGNING_PRIVATE_KEY_PEM`
- `CREDENTIAL_SIGNING_PUBLIC_KEY_PEM`
- `CREDENTIAL_SIGNING_VERIFICATION_METHOD`
- `ACADID_REQUIRE_CONFIGURED_SIGNING_KEYS=true`

Store the private key only in the deployment secret store. Do not commit it, paste it into public chat, or put it in frontend code.

## Validate Deployment

After secrets are configured and the project is built:

```bash
npm run build
npm run crypto:validate
```

Validation must pass before pilot credential issuance. The validator signs and verifies a sample payload and prints only public readiness metadata.

## Expected Health Status

Founder Console System Health should show:

- `Credential Signing`: `OPERATIONAL`
- proof profile: `JOSE_JWS`
- algorithm: `EdDSA`
- curve: `Ed25519`
- key source: `CONFIGURED`

If it shows `DEGRADED`, the API is using an ephemeral development key or missing required signing secrets.

## Rotation

1. Generate a new keypair.
2. Choose a new verification method, for example `did:web:acadid.ng#issuer-ed25519-2026-02`.
3. Publish the public key in the DID document or trusted key registry before issuing credentials with it.
4. Deploy the new private/public key pair together.
5. Run `npm run crypto:validate`.
6. Keep old public keys resolvable for already issued credentials.

Never delete old public verification methods while old credentials can still be verified.
