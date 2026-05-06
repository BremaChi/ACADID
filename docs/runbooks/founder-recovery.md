# Founder Recovery Runbook

Owner: Engineer 1 / Data Center API  
Audience: Founder, operations engineer  
Status: Pilot-ready procedure

## Purpose

Founder access is a critical control-plane dependency. This runbook explains how to recover the Founder Console account without weakening production security.

## Normal Sign-In

Founder sign-in uses:

- email and password,
- TOTP authenticator code when MFA is enabled,
- one-time recovery code when MFA is unavailable.

## Check Founder Email

Default seeded local founder:

```text
founder@acadid.local
```

For production, use the founder email configured in the deployment environment.

## Reset Password Safely

Generate a one-time password:

```bash
npm run founder:reset-password -- --email founder@acadid.local --generate
```

The generated password is shown once. Store it securely and change it after sign-in.

## Reset Password With A Known Secure Value

Use an environment variable so the password is not stored in shell history:

```bash
FOUNDER_NEW_PASSWORD="replace-with-strong-password" npm run founder:reset-password -- --email founder@acadid.local
```

On Windows PowerShell:

```powershell
$env:FOUNDER_NEW_PASSWORD="replace-with-strong-password"
npm run founder:reset-password -- --email founder@acadid.local
Remove-Item Env:\FOUNDER_NEW_PASSWORD
```

## Clear MFA Only When Necessary

If the founder lost both authenticator access and recovery codes:

```bash
npm run founder:reset-password -- --email founder@acadid.local --generate --clear-mfa
```

After sign-in, immediately set up TOTP again from the Founder Console Security page.

## Audit Expectation

Every reset writes a `founder.password.reset` audit event. Review the Founder Console Security page after recovery.

## Do Not

- Do not edit the database manually.
- Do not send passwords through public chat.
- Do not disable MFA permanently.
- Do not reset a non-founder account with this command.

