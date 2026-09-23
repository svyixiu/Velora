# Security Policy

Velora handles Roblox Quick Sign-in locally. Authentication-related bugs should be treated as sensitive.

## Security invariants

Contributions must preserve these rules:

- Never return the Quick Sign-in `privateKey` to browser JavaScript.
- Never return `.ROBLOSECURITY` to browser JavaScript.
- Never send either value to Vercel, analytics, logging, crash reporting, or another remote service.
- Never write either value to disk.
- Never ask a user to paste a Roblox password, session cookie, access token, email verification code, or 2FA code into Velora.
- Keep active Quick Sign-in state in local process memory only.
- Destroy local challenge state after validation, cancellation, or expiry.
- Use the Roblox session only long enough to resolve `/v1/users/authenticated`.
- Keep the companion bound to loopback (`127.0.0.1`) unless the threat model is explicitly redesigned.
- Restrict browser origins accepted by the local companion.

## Local session note

After a Quick Sign-in challenge is approved, Roblox's final AuthToken exchange creates a normal authenticated session. Velora Companion temporarily receives that session in RAM because that is how Roblox identifies the account that approved the challenge.

Velora does not expose or persist that session. Once the authenticated user ID, username, and display name are resolved, the application's reference to the cookie is discarded and only non-secret mirror data is returned.

JavaScript strings cannot be reliably zeroized by the runtime, so this design minimizes retention rather than claiming cryptographic memory erasure.

## Reporting a vulnerability

Do not place active authentication bypasses, cookies, Quick Sign-in private keys, or other credentials in a public GitHub issue. Open a minimal issue requesting a private contact path instead.
