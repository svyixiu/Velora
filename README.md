# Velora

Velora is an open-source Roblox account mirror built around Roblox Quick Sign-in.

> Unofficial project. Velora is not affiliated with Roblox Corporation.

## Why Velora has a local companion

Roblox Quick Sign-in checks that the device generating the code is near the device approving it. A serverless deployment such as Vercel generates requests from a datacenter, not from your home network, so codes created directly by a Vercel function can fail Roblox's location check.

Velora therefore uses the same high-level strategy as desktop clients such as Froststrap: the Quick Sign-in protocol runs locally on the device being signed in.

```text
Velora website
      |
      | localhost only
      v
Velora Companion
      |
      | /login/create
      | /login/status
      | /v2/login after approval
      v
Roblox
```

The approving device should be on the same network / nearby, as required by Roblox.

## Authentication flow

1. Run Velora Companion on the computer that is being signed in.
2. Open the hosted Velora website on that same computer.
3. The website connects only to `127.0.0.1:43127`.
4. Velora Companion requests a Quick Sign-in code directly from Roblox using the computer's own network connection.
5. Enter that code on a Roblox device where you are already signed in.
6. Companion polls Roblox until the challenge becomes `Validated`.
7. Companion performs Roblox's final AuthToken login exchange locally.
8. The resulting `.ROBLOSECURITY` value is held only in local process memory and is used once to call `/v1/users/authenticated`.
9. The cookie reference and Quick Sign-in private key are discarded.
10. Only sanitized account/profile data is returned to the Velora page.

The Roblox session cookie is never returned to browser JavaScript, sent to Vercel, logged, or written to disk.

## What the mirror shows

- Roblox user ID
- username and display name
- verified badge state
- public description
- account creation date
- public account state
- avatar headshot
- friends, followers, following and group counts when available
- public group memberships and roles when available

## Run the companion

Requirements: Node.js 20.9+.

```bash
git clone https://github.com/svyixiu/Velora.git
cd Velora
npm install
npm run companion
```

Keep that terminal open while using Quick Sign-in.

By default the companion allows requests from:

- `https://velora-nu-roan.vercel.app`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

For another hosted Velora origin:

```bash
VELORA_ORIGIN=https://your-domain.example npm run companion
```

On Windows PowerShell:

```powershell
$env:VELORA_ORIGIN="https://your-domain.example"
npm run companion
```

## Local web development

In a second terminal:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Vercel deployment

Import the repository and deploy normally. No Vercel environment variable, database, or Roblox credential is required.

The Vercel deployment is only the interface. Quick Sign-in itself is performed by the local companion.

## Important device requirement

The browser using Velora must be on the same computer as Velora Companion because the site connects to `127.0.0.1`.

A phone browsing the Vercel site cannot reach a companion running on your PC through `127.0.0.1`; on a phone, `127.0.0.1` means the phone itself.

For the intended flow:

```text
PC: Velora website + Velora Companion
Phone: Roblox account already signed in
Both: same network / nearby
```

## Security

- Quick Sign-in `privateKey` stays in companion memory.
- `.ROBLOSECURITY` stays in companion memory.
- The session cookie is used only to resolve the authenticated account.
- Neither secret is returned to the website.
- Neither secret is sent to Vercel.
- Neither secret is written to disk.
- Active challenges are automatically removed when expired.
- The localhost bridge is bound to `127.0.0.1`, not the LAN.
- Browser origins are restricted by the companion.

See [SECURITY.md](./SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
