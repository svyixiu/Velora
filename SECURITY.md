# Security Policy

Velora handles a short-lived Roblox Quick Login challenge, so authentication-related bugs should be treated as sensitive even though Velora intentionally never creates a Roblox session.

## Security invariants

Contributions must preserve these rules:

- Never expose the Quick Login `privateKey` to client JavaScript, HTML, logs, analytics, error tracking, or URLs.
- Never call Roblox's final AuthToken login exchange or capture a `.ROBLOSECURITY` cookie.
- Never ask a user for their Roblox password, session cookie, access token, email verification code, or 2FA code.
- Never persist Quick Login challenge material in a database.
- Destroy challenge state after validation, cancellation, or expiry.
- Treat `VELORA_SESSION_SECRET` as a deployment secret and never commit it.

## Reporting a vulnerability

Please avoid posting active authentication bypasses or leaked credentials in a public issue. Open a minimal issue asking for a private contact path, without including secrets or exploit details.
