# Security Policy

Velora handles a short-lived Roblox Quick Login challenge, so authentication-related bugs should be treated as sensitive even though Velora intentionally never creates a Roblox session.

## Security invariants

Contributions must preserve these rules:

- Never expose the Quick Login `privateKey` to client JavaScript, HTML, logs, analytics, error tracking, or URLs.
- Never expose the ephemeral per-attempt encryption key to client JavaScript.
- Never call Roblox's final AuthToken login exchange or capture a `.ROBLOSECURITY` cookie.
- Never ask a user for their Roblox password, session cookie, access token, email verification code, or 2FA code.
- Never persist Quick Login challenge material in a database.
- Generate a new cryptographically random 256-bit key for every Quick Login attempt.
- Keep the key and encrypted challenge in separate `HttpOnly` cookies.
- Destroy both cookies after validation, cancellation, or expiry.

## Threat-model note

The current zero-configuration design intentionally stores both the ephemeral encryption key and encrypted challenge in separate browser cookies. `HttpOnly` prevents ordinary page JavaScript from reading them, but compromise of the browser's raw cookie storage can expose both pieces.

Their lifetime is restricted to the short Roblox Quick Login challenge window, and Velora never turns the validated challenge into a Roblox login session.

## Reporting a vulnerability

Please avoid posting active authentication bypasses or leaked credentials in a public issue. Open a minimal issue asking for a private contact path, without including secrets or exploit details.
